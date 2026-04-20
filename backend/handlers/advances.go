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

type AdvanceRow struct {
	ID          string   `db:"id"          json:"id"`
	EmpID       string   `db:"emp_id"      json:"emp_id"`
	Date        string   `db:"date"        json:"date"`
	Amount      float64  `db:"amount"      json:"amount"`
	Deducted    int      `db:"deducted"    json:"deducted"`
	DeductedIn  *string  `db:"deducted_in" json:"deducted_in"`
	Notes       *string  `db:"notes"       json:"notes"`
	CreatedAt   string   `db:"created_at"  json:"created_at"`
	EmpName     *string  `db:"emp_name"    json:"emp_name,omitempty"`
}

func AdvanceRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/pending", getPendingAdvances)
	r.Get("/", listAdvances)
	r.With(mw.RequireAdmin).Post("/", addAdvance)
	r.With(mw.RequireAdmin).Delete("/{id}", deleteAdvance)
}

func listAdvances(w http.ResponseWriter, r *http.Request) {
	empID := r.URL.Query().Get("emp_id")
	advances := []AdvanceRow{}
	var err error
	if empID != "" {
		err = db.DB.Select(&advances,
			`SELECT a.*, e.name as emp_name FROM advances a JOIN employees e ON a.emp_id = e.id
			 WHERE a.emp_id = ? ORDER BY a.date DESC`,
			empID)
	} else {
		err = db.DB.Select(&advances,
			`SELECT a.*, e.name as emp_name FROM advances a JOIN employees e ON a.emp_id = e.id
			 ORDER BY a.date DESC`)
	}
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, advances)
}

func getPendingAdvances(w http.ResponseWriter, r *http.Request) {
	pending := []struct {
		ID           string  `db:"id"            json:"id"`
		Name         string  `db:"name"          json:"name"`
		PendingTotal float64 `db:"pending_total" json:"pending_total"`
	}{}
	if err := db.DB.Select(&pending,
		`SELECT e.id, e.name, COALESCE(SUM(a.amount),0) as pending_total
		 FROM employees e
		 LEFT JOIN advances a ON e.id = a.emp_id AND a.deducted = 0
		 WHERE e.status = 'active'
		 GROUP BY e.id ORDER BY e.name ASC`); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, pending)
}

func addAdvance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EmpID  string   `json:"emp_id"`
		Date   string   `json:"date"`
		Amount float64  `json:"amount"`
		Notes  *string  `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmpID == "" || body.Date == "" || body.Amount <= 0 {
		JSONErr(w, "emp_id, date, and a positive amount required", http.StatusBadRequest)
		return
	}

	var emp struct {
		ID   string `db:"id"`
		Name string `db:"name"`
	}
	if err := db.DB.Get(&emp, "SELECT id, name FROM employees WHERE id = ?", body.EmpID); err != nil {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}

	id := uuid.New().String()
	if _, err := db.DB.Exec(
		"INSERT INTO advances (id, emp_id, date, amount, notes) VALUES (?, ?, ?, ?, ?)",
		id, body.EmpID, body.Date, body.Amount, body.Notes,
	); err != nil {
		JSONErr(w, "Failed to save advance", http.StatusInternalServerError)
		return
	}

	var adv AdvanceRow
	if err := db.DB.Get(&adv, "SELECT * FROM advances WHERE id = ?", id); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	claims := mw.GetClaims(r)
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
		"add_advance", "advance", id,
		formatRupees(body.Amount)+" advance to "+emp.Name)

	JSONCreated(w, adv)
}

func deleteAdvance(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var adv AdvanceRow
	if err := db.DB.Get(&adv, "SELECT * FROM advances WHERE id = ?", id); err != nil {
		JSONErr(w, "Advance not found", http.StatusNotFound)
		return
	}
	if adv.Deducted != 0 {
		JSONErr(w, "Cannot delete already-deducted advance", http.StatusBadRequest)
		return
	}
	if _, err := db.DB.Exec("DELETE FROM advances WHERE id = ?", id); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONMsg(w, "Advance deleted")
}

func formatRupees(amount float64) string {
	return "Rs." + strconv.FormatFloat(amount, 'f', 2, 64)
}
