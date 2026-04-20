package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

type AttendanceRow struct {
	ID        string  `db:"id"         json:"id"`
	EmpID     string  `db:"emp_id"     json:"emp_id"`
	Date      string  `db:"date"       json:"date"`
	Status    string  `db:"status"     json:"status"`
	Notes     *string `db:"notes"      json:"notes"`
	CreatedAt string  `db:"created_at" json:"created_at"`
	EmpName   *string `db:"emp_name"   json:"emp_name,omitempty"`
	PayType   *string `db:"pay_type"   json:"pay_type,omitempty"`
}

func AttendanceRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/", getAttendance)
	r.With(mw.RequireWrite).Post("/", markAttendance)
	r.With(mw.RequireWrite).Delete("/", undoAttendance)
	r.Get("/summary/{month}", attendanceSummary)
	r.Get("/daily-summary/{month}", dailySummary)
	r.Get("/date/{date}", attendanceByDate)
}

func getAttendance(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		JSONErr(w, "month (YYYY-MM) required", http.StatusBadRequest)
		return
	}
	empID := r.URL.Query().Get("emp_id")

	rows := []AttendanceRow{}
	var err error
	if empID != "" {
		err = db.DB.Select(&rows,
			`SELECT a.*, e.name as emp_name, e.pay_type FROM attendance a
			 JOIN employees e ON a.emp_id = e.id
			 WHERE a.date LIKE ? AND a.emp_id = ? ORDER BY a.date ASC, e.name ASC`,
			month+"%", empID)
	} else {
		err = db.DB.Select(&rows,
			`SELECT a.*, e.name as emp_name, e.pay_type FROM attendance a
			 JOIN employees e ON a.emp_id = e.id
			 WHERE a.date LIKE ? ORDER BY a.date ASC, e.name ASC`,
			month+"%")
	}
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, rows)
}

func attendanceByDate(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	marked := []AttendanceRow{}
	db.DB.Select(&marked,
		`SELECT a.*, e.name as emp_name, e.pay_type FROM attendance a
		 JOIN employees e ON a.emp_id = e.id
		 WHERE a.date = ? AND e.status = 'active' ORDER BY e.name ASC`,
		date)

	var activeEmps []struct {
		ID      string `db:"id"       json:"id"`
		Name    string `db:"name"     json:"name"`
		PayType string `db:"pay_type" json:"pay_type"`
	}
	db.DB.Select(&activeEmps, "SELECT id, name, pay_type FROM employees WHERE status = 'active'")

	markedSet := make(map[string]bool)
	for _, a := range marked {
		markedSet[a.EmpID] = true
	}
	var unmarked []interface{}
	for _, e := range activeEmps {
		if !markedSet[e.ID] {
			unmarked = append(unmarked, e)
		}
	}
	if unmarked == nil {
		unmarked = []interface{}{}
	}

	JSONOk(w, map[string]interface{}{"marked": marked, "unmarked": unmarked})
}

func dailySummary(w http.ResponseWriter, r *http.Request) {
	month := chi.URLParam(r, "month")
	summary := []struct {
		Date    string `db:"date"     json:"date"`
		Present int    `db:"present"  json:"present"`
		Absent  int    `db:"absent"   json:"absent"`
		HalfDay int    `db:"half_day" json:"half_day"`
		Total   int    `db:"total"    json:"total"`
	}{}
	db.DB.Select(&summary,
		`SELECT date,
			SUM(CASE WHEN status='P' THEN 1 ELSE 0 END) as present,
			SUM(CASE WHEN status='A' THEN 1 ELSE 0 END) as absent,
			SUM(CASE WHEN status='H' THEN 1 ELSE 0 END) as half_day,
			COUNT(*) as total
		 FROM attendance WHERE date LIKE ?
		 GROUP BY date ORDER BY date ASC`,
		month+"%")
	JSONOk(w, summary)
}

type attendanceEntry struct {
	EmpID  string  `json:"emp_id"`
	Date   string  `json:"date"`
	Status string  `json:"status"`
	Notes  *string `json:"notes"`
}

func markAttendance(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		JSONErr(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var entries []attendanceEntry
	if len(raw) > 0 && raw[0] == '[' {
		json.Unmarshal(raw, &entries)
	} else {
		var entry attendanceEntry
		if err := json.Unmarshal(raw, &entry); err != nil {
			JSONErr(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		entries = []attendanceEntry{entry}
	}

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	claims := mw.GetClaims(r)
	type logEntry struct{ empName, status, date, empID string }
	var logEntries []logEntry

	for _, e := range entries {
		if e.EmpID == "" || e.Date == "" || e.Status == "" {
			JSONErr(w, "emp_id, date, status required", http.StatusBadRequest)
			return
		}
		var emp struct {
			Name     string `db:"name"`
			JoinDate string `db:"join_date"`
		}
		if err := tx.Get(&emp, "SELECT name, join_date FROM employees WHERE id = ?", e.EmpID); err != nil {
			JSONErr(w, "Employee not found", http.StatusBadRequest)
			return
		}
		if e.Date < emp.JoinDate {
			JSONErr(w, emp.Name+" has not joined yet on "+e.Date+" (joining "+emp.JoinDate+")", http.StatusBadRequest)
			return
		}
		_, err := tx.Exec(
			`INSERT INTO attendance (id, emp_id, date, status, notes) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(emp_id, date) DO UPDATE SET status = excluded.status, notes = excluded.notes`,
			uuid.New().String(), e.EmpID, e.Date, e.Status, e.Notes,
		)
		if err != nil {
			JSONErr(w, "Failed to save attendance", http.StatusInternalServerError)
			return
		}
		logEntries = append(logEntries, logEntry{emp.Name, e.Status, e.Date, e.EmpID})
	}

	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	// LogActivity must run after Commit — calling DB.Exec inside an open
	// transaction deadlocks when MaxOpenConns=1.
	for _, le := range logEntries {
		db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
			"mark_attendance", "attendance", le.empID,
			le.empName+" → "+le.status+" on "+le.date)
	}

	JSONOk(w, map[string]string{"message": strconv.Itoa(len(entries)) + " record(s) saved"})
}

func undoAttendance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EmpID  string `json:"emp_id"`
		Date   string `json:"date"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmpID == "" || body.Date == "" {
		JSONErr(w, "emp_id and date required", http.StatusBadRequest)
		return
	}

	var record AttendanceRow
	if err := db.DB.Get(&record, "SELECT * FROM attendance WHERE emp_id = ? AND date = ?", body.EmpID, body.Date); err != nil {
		JSONErr(w, "No attendance record found", http.StatusNotFound)
		return
	}

	db.DB.Exec("DELETE FROM attendance WHERE emp_id = ? AND date = ?", body.EmpID, body.Date)

	var empName struct{ Name string `db:"name"` }
	db.DB.Get(&empName, "SELECT name FROM employees WHERE id = ?", body.EmpID)
	detail := "Undid " + record.Status + " for " + empName.Name + " on " + body.Date
	if body.Reason != "" {
		detail += " — Reason: " + body.Reason
	}
	claims := mw.GetClaims(r)
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
		"undo_attendance", "attendance", body.EmpID, detail)

	JSONMsg(w, "Attendance undone")
}

func attendanceSummary(w http.ResponseWriter, r *http.Request) {
	month := chi.URLParam(r, "month")
	summary := []struct {
		ID            string   `db:"id"             json:"id"`
		Name          string   `db:"name"           json:"name"`
		PayType       string   `db:"pay_type"       json:"pay_type"`
		MonthlySalary *float64 `db:"monthly_salary" json:"monthly_salary"`
		DailyRate     *float64 `db:"daily_rate"     json:"daily_rate"`
		Present       float64  `db:"present"        json:"present"`
		Absent        float64  `db:"absent"         json:"absent"`
		HalfDay       float64  `db:"half_day"       json:"half_day"`
		DaysWorked    float64  `db:"days_worked"    json:"days_worked"`
	}{}
	db.DB.Select(&summary,
		`SELECT e.id, e.name, e.pay_type, e.monthly_salary, e.daily_rate,
			SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) as present,
			SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) as absent,
			SUM(CASE WHEN a.status='H' THEN 1 ELSE 0 END) as half_day,
			SUM(CASE WHEN a.status='P' THEN 1 WHEN a.status='H' THEN 0.5 ELSE 0 END) as days_worked
		 FROM employees e
		 LEFT JOIN attendance a ON e.id = a.emp_id AND a.date LIKE ?
		 WHERE e.status = 'active'
		 GROUP BY e.id ORDER BY e.name ASC`,
		month+"%")
	JSONOk(w, summary)
}

