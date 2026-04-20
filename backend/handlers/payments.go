package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

type PaymentRow struct {
	ID              string   `db:"id"               json:"id"`
	EmpID           string   `db:"emp_id"           json:"emp_id"`
	Month           string   `db:"month"            json:"month"`
	DaysWorked      float64  `db:"days_worked"      json:"days_worked"`
	GrossAmount     float64  `db:"gross_amount"     json:"gross_amount"`
	AdvanceDeducted float64  `db:"advance_deducted" json:"advance_deducted"`
	NetAmount       float64  `db:"net_amount"       json:"net_amount"`
	Status          string   `db:"status"           json:"status"`
	PaidDate        *string  `db:"paid_date"        json:"paid_date"`
	Notes           *string  `db:"notes"            json:"notes"`
	CreatedAt       string   `db:"created_at"       json:"created_at"`
	UpdatedAt       string   `db:"updated_at"       json:"updated_at"`
	EmpName         *string  `db:"emp_name"         json:"emp_name,omitempty"`
	EmpPayType      *string  `db:"pay_type"         json:"pay_type,omitempty"`
	MonthlySalary   *float64 `db:"monthly_salary"   json:"monthly_salary,omitempty"`
	DailyRate       *float64 `db:"daily_rate"       json:"daily_rate,omitempty"`
	PendingAdvance  float64  `db:"pending_advance"  json:"pending_advance"`
}

func PaymentRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/", listPayments)
	r.With(mw.RequireAdmin).Post("/generate/{month}", generatePayments)
	r.With(mw.RequireAdmin).Patch("/{id}/pay", markPaid)
	r.With(mw.RequireAdmin).Patch("/{id}/unpay", undoPayment)
	r.With(mw.RequireAdmin).Patch("/{id}", updatePaymentNotes)
}

func daysInMonth(month string) int {
	parts := strings.Split(month, "-")
	if len(parts) != 2 {
		return 30
	}
	y, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	return time.Date(y, time.Month(m)+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func calcGross(payType string, monthlySalary, dailyRate, daysWorked float64, totalDays int) float64 {
	if payType == "DAILY" {
		return dailyRate * daysWorked
	}
	return (monthlySalary / float64(totalDays)) * daysWorked
}

func listPayments(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if month == "" {
		JSONErr(w, "month (YYYY-MM) required", http.StatusBadRequest)
		return
	}
	payments := []PaymentRow{}
	db.DB.Select(&payments,
		`SELECT p.*, e.name as emp_name, e.pay_type, e.monthly_salary, e.daily_rate,
		        COALESCE((SELECT SUM(a.amount) FROM advances a WHERE a.emp_id=p.emp_id AND a.deducted=0),0) as pending_advance
		 FROM payments p JOIN employees e ON p.emp_id = e.id
		 WHERE p.month = ? ORDER BY e.name ASC`,
		month)
	JSONOk(w, payments)
}

func generatePayments(w http.ResponseWriter, r *http.Request) {
	month := chi.URLParam(r, "month")
	totalDays := daysInMonth(month)

	var employees []struct {
		ID            string   `db:"id"`
		Name          string   `db:"name"`
		PayType       string   `db:"pay_type"`
		MonthlySalary *float64 `db:"monthly_salary"`
		DailyRate     *float64 `db:"daily_rate"`
	}
	db.DB.Select(&employees, "SELECT id, name, pay_type, monthly_salary, daily_rate FROM employees WHERE status = 'active'")

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	type result struct {
		EmpID      string  `json:"emp_id"`
		Name       string  `json:"name"`
		DaysWorked float64 `json:"daysWorked"`
		Gross      float64 `json:"gross"`
		AdvDed     float64 `json:"advDeducted"`
		Net        float64 `json:"net"`
	}
	var results []result

	for _, emp := range employees {
		var att struct {
			DaysWorked *float64 `db:"days_worked"`
		}
		tx.Get(&att,
			`SELECT SUM(CASE WHEN status='P' THEN 1 WHEN status='H' THEN 0.5 ELSE 0 END) as days_worked
			 FROM attendance WHERE emp_id = ? AND date LIKE ?`,
			emp.ID, month+"%")

		daysWorked := 0.0
		if att.DaysWorked != nil {
			daysWorked = *att.DaysWorked
		}

		ms := 0.0
		if emp.MonthlySalary != nil {
			ms = *emp.MonthlySalary
		}
		dr := 0.0
		if emp.DailyRate != nil {
			dr = *emp.DailyRate
		}
		gross := calcGross(emp.PayType, ms, dr, daysWorked, totalDays)

		var pendAdv struct {
			Total float64 `db:"total"`
		}
		tx.Get(&pendAdv, "SELECT COALESCE(SUM(amount),0) as total FROM advances WHERE emp_id=? AND deducted=0", emp.ID)

		advDed := pendAdv.Total
		if advDed > gross {
			advDed = gross
		}
		net := gross - advDed

		if _, err := tx.Exec(
			`INSERT INTO payments (id, emp_id, month, days_worked, gross_amount, advance_deducted, net_amount)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(emp_id, month) DO UPDATE SET
			   days_worked = excluded.days_worked,
			   gross_amount = excluded.gross_amount,
			   advance_deducted = excluded.advance_deducted,
			   net_amount = excluded.net_amount,
			   updated_at = datetime('now')
			 WHERE payments.status = 'pending'`,
			uuid.New().String(), emp.ID, month, daysWorked, gross, advDed, net,
		); err != nil {
			JSONErr(w, "Failed to save payment for "+emp.Name, http.StatusInternalServerError)
			return
		}

		results = append(results, result{EmpID: emp.ID, Name: emp.Name, DaysWorked: daysWorked, Gross: gross, AdvDed: advDed, Net: net})
	}

	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, results)
}

func markPaid(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var payment PaymentRow
	if err := db.DB.Get(&payment, "SELECT * FROM payments WHERE id = ?", id); err != nil {
		JSONErr(w, "Payment not found", http.StatusNotFound)
		return
	}
	if payment.Status == "paid" {
		JSONErr(w, "Payment already marked as paid", http.StatusBadRequest)
		return
	}

	var body struct {
		PaidDate string `json:"paid_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		log.Printf("markPaid: decode body: %v", err)
	}
	paidDate := body.PaidDate
	if paidDate == "" {
		paidDate = time.Now().Format("2006-01-02")
	}

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if payment.AdvanceDeducted > 0 {
		var advances []struct {
			ID     string  `db:"id"`
			Amount float64 `db:"amount"`
		}
		if err := tx.Select(&advances,
			"SELECT id, amount FROM advances WHERE emp_id = ? AND deducted = 0 ORDER BY date ASC",
			payment.EmpID); err != nil {
			JSONErr(w, "Server error", http.StatusInternalServerError)
			return
		}

		remaining := payment.AdvanceDeducted
		for _, adv := range advances {
			if remaining <= 0 {
				break
			}
			if _, err := tx.Exec("UPDATE advances SET deducted=1, deducted_in=? WHERE id=?", payment.Month, adv.ID); err != nil {
				JSONErr(w, "Failed to update advance", http.StatusInternalServerError)
				return
			}
			remaining -= adv.Amount
		}
	}

	if _, err := tx.Exec("UPDATE payments SET status='paid', paid_date=?, updated_at=datetime('now') WHERE id=?", paidDate, id); err != nil {
		JSONErr(w, "Failed to update payment", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	var updated PaymentRow
	db.DB.Get(&updated, "SELECT * FROM payments WHERE id = ?", id)
	JSONOk(w, updated)
}

func undoPayment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var payment PaymentRow
	if err := db.DB.Get(&payment, "SELECT * FROM payments WHERE id = ?", id); err != nil {
		JSONErr(w, "Payment not found", http.StatusNotFound)
		return
	}
	if payment.Status != "paid" {
		JSONErr(w, "Payment is not marked as paid", http.StatusBadRequest)
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	if payment.AdvanceDeducted > 0 {
		if _, err := tx.Exec(
			"UPDATE advances SET deducted=0, deducted_in=NULL WHERE emp_id=? AND deducted_in=?",
			payment.EmpID, payment.Month,
		); err != nil {
			JSONErr(w, "Failed to restore advances", http.StatusInternalServerError)
			return
		}
	}

	var notesVal interface{}
	if body.Reason != "" {
		notesVal = body.Reason
	}
	if _, err := tx.Exec(
		"UPDATE payments SET status='pending', paid_date=NULL, notes=?, updated_at=datetime('now') WHERE id=?",
		notesVal, id,
	); err != nil {
		JSONErr(w, "Failed to update payment", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	claims := mw.GetClaims(r)
	detail := "Undid paid payment for " + payment.Month
	if body.Reason != "" {
		detail += " — Reason: " + body.Reason
	}
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
		"undo_payment", "payment", id, detail)

	var updated PaymentRow
	db.DB.Get(&updated, "SELECT * FROM payments WHERE id = ?", id)
	JSONOk(w, updated)
}

func updatePaymentNotes(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Notes *string `json:"notes"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	db.DB.Exec("UPDATE payments SET notes=?, updated_at=datetime('now') WHERE id=?", body.Notes, id)
	var payment PaymentRow
	db.DB.Get(&payment, "SELECT * FROM payments WHERE id = ?", id)
	JSONOk(w, payment)
}
