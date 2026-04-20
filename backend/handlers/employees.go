package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"time"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

type Employee struct {
	ID            string   `db:"id"             json:"id"`
	Name          string   `db:"name"           json:"name"`
	Phone         *string  `db:"phone"          json:"phone"`
	Address       *string  `db:"address"        json:"address"`
	Photo         *string  `db:"photo"          json:"photo"`
	PayType       string   `db:"pay_type"       json:"pay_type"`
	MonthlySalary *float64 `db:"monthly_salary" json:"monthly_salary"`
	DailyRate     *float64 `db:"daily_rate"     json:"daily_rate"`
	JoinDate      string   `db:"join_date"      json:"join_date"`
	Status        string   `db:"status"         json:"status"`
	Notes         *string  `db:"notes"          json:"notes"`
	CreatedAt     string   `db:"created_at"     json:"created_at"`
	UpdatedAt     string   `db:"updated_at"     json:"updated_at"`
}

func EmployeeRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/", listEmployees)
	r.With(mw.RequireAdmin).Post("/", createEmployee)
	r.Get("/{id}/summary", employeeSummary)
	r.Get("/{id}", getEmployee)
	r.With(mw.RequireAdmin).Put("/{id}", updateEmployee)
	r.With(mw.RequireAdmin).Delete("/{id}", deleteEmployee)
}

func uploadDir() string {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/gharsaathi.db"
	}
	dataDir := filepath.Dir(dbPath)
	if d := os.Getenv("UPLOAD_DIR"); d != "" {
		return d
	}
	return filepath.Join(dataDir, "documents")
}

func listEmployees(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	employees := []Employee{}
	if status == "active" || status == "inactive" {
		db.DB.Select(&employees, "SELECT * FROM employees WHERE status = ? ORDER BY name ASC", status)
	} else {
		db.DB.Select(&employees, "SELECT * FROM employees ORDER BY name ASC")
	}
	JSONOk(w, employees)
}

func getEmployee(w http.ResponseWriter, r *http.Request) {
	var emp Employee
	if err := db.DB.Get(&emp, "SELECT * FROM employees WHERE id = ?", chi.URLParam(r, "id")); err != nil {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}
	JSONOk(w, emp)
}

func createEmployee(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string   `json:"name"`
		Phone         *string  `json:"phone"`
		Address       *string  `json:"address"`
		Photo         *string  `json:"photo"`
		PayType       string   `json:"pay_type"`
		MonthlySalary *float64 `json:"monthly_salary"`
		DailyRate     *float64 `json:"daily_rate"`
		JoinDate      string   `json:"join_date"`
		Notes         *string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.JoinDate == "" {
		JSONErr(w, "name and join_date required", http.StatusBadRequest)
		return
	}
	if body.PayType == "" {
		body.PayType = "MONTHLY"
	}
	if body.PayType == "MONTHLY" && (body.MonthlySalary == nil || *body.MonthlySalary == 0) {
		JSONErr(w, "monthly_salary required for MONTHLY pay type", http.StatusBadRequest)
		return
	}
	if body.PayType == "DAILY" && (body.DailyRate == nil || *body.DailyRate == 0) {
		JSONErr(w, "daily_rate required for DAILY pay type", http.StatusBadRequest)
		return
	}

	id := uuid.New().String()
	_, err := db.DB.Exec(
		`INSERT INTO employees (id, name, phone, address, photo, pay_type, monthly_salary, daily_rate, join_date, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, body.Name, body.Phone, body.Address, body.Photo,
		body.PayType, body.MonthlySalary, body.DailyRate, body.JoinDate, body.Notes,
	)
	if err != nil {
		JSONErr(w, "Failed to create employee", http.StatusInternalServerError)
		return
	}

	var emp Employee
	db.DB.Get(&emp, "SELECT * FROM employees WHERE id = ?", id)
	claims := mw.GetClaims(r)
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name}, "add_employee", "employee", id, "Added "+body.Name)
	JSONCreated(w, emp)
}

func updateEmployee(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var check struct{ ID string `db:"id"` }
	if err := db.DB.Get(&check, "SELECT id FROM employees WHERE id = ?", id); err != nil {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}

	var body struct {
		Name          string   `json:"name"`
		Phone         *string  `json:"phone"`
		Address       *string  `json:"address"`
		Photo         *string  `json:"photo"`
		PayType       string   `json:"pay_type"`
		MonthlySalary *float64 `json:"monthly_salary"`
		DailyRate     *float64 `json:"daily_rate"`
		JoinDate      string   `json:"join_date"`
		Status        string   `json:"status"`
		Notes         *string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		JSONErr(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if body.Status == "" {
		body.Status = "active"
	}

	if _, err := db.DB.Exec(
		`UPDATE employees SET name=?, phone=?, address=?, photo=?, pay_type=?, monthly_salary=?,
		 daily_rate=?, join_date=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`,
		body.Name, body.Phone, body.Address, body.Photo, body.PayType, body.MonthlySalary,
		body.DailyRate, body.JoinDate, body.Status, body.Notes, id,
	); err != nil {
		JSONErr(w, "Failed to update employee", http.StatusInternalServerError)
		return
	}

	var emp Employee
	db.DB.Get(&emp, "SELECT * FROM employees WHERE id = ?", id)
	claims := mw.GetClaims(r)
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name}, "update_employee", "employee", id, "Updated "+emp.Name)
	JSONOk(w, emp)
}

func deleteEmployee(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var docs []struct {
		Filename string `db:"filename"`
	}
	tx.Select(&docs, "SELECT filename FROM documents WHERE emp_id = ?", id)

	result, err := tx.Exec("DELETE FROM employees WHERE id = ?", id)
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}
	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	uDir := uploadDir()
	for _, doc := range docs {
		os.Remove(filepath.Join(uDir, doc.Filename))
	}

	JSONMsg(w, "Employee deleted")
}

func employeeSummary(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var emp Employee
	if err := db.DB.Get(&emp, "SELECT * FROM employees WHERE id = ?", id); err != nil {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}

	currentMonth := time.Now().Format("2006-01")

	var att struct {
		Present  float64 `db:"present"`
		Absent   float64 `db:"absent"`
		HalfDays float64 `db:"half_days"`
	}
	db.DB.Get(&att, `
		SELECT
			SUM(CASE WHEN status='P' THEN 1 ELSE 0 END) as present,
			SUM(CASE WHEN status='A' THEN 1 ELSE 0 END) as absent,
			SUM(CASE WHEN status='H' THEN 0.5 ELSE 0 END) as half_days
		FROM attendance WHERE emp_id = ? AND date LIKE ?`,
		id, currentMonth+"%",
	)

	var pendingAdv struct {
		Total float64 `db:"total"`
	}
	db.DB.Get(&pendingAdv, "SELECT COALESCE(SUM(amount), 0) as total FROM advances WHERE emp_id = ? AND deducted = 0", id)

	JSONOk(w, map[string]interface{}{
		"employee":     emp,
		"currentMonth": map[string]interface{}{"attendance": att, "pendingAdvances": pendingAdv.Total},
	})
}
