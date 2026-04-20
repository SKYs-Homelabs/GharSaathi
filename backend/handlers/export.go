package handlers

import (
	"bytes"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jung-kurt/gofpdf"
	"github.com/xuri/excelize/v2"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

var monthSanitize = regexp.MustCompile(`[^0-9\-]`)

func ExportRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/pdf/{month}", exportPDF)
	r.Get("/excel/{month}", exportExcel)
}

func getPaymentData(month string) []PaymentRow {
	var payments []PaymentRow
	db.DB.Select(&payments,
		`SELECT p.*, e.name as emp_name, e.pay_type, e.monthly_salary, e.daily_rate
		 FROM payments p JOIN employees e ON p.emp_id = e.id
		 WHERE p.month = ? ORDER BY e.name ASC`,
		month)
	return payments
}

type empRow struct {
	ID      string `db:"id"`
	Name    string `db:"name"`
	PayType string `db:"pay_type"`
}

type attCell struct {
	EmpID  string `db:"emp_id"`
	Date   string `db:"date"`
	Status string `db:"status"`
}

func fmtRs(n float64) string {
	return fmt.Sprintf("Rs.%.2f", n)
}

func exportPDF(w http.ResponseWriter, r *http.Request) {
	month := monthSanitize.ReplaceAllString(chi.URLParam(r, "month"), "")
	payments := getPaymentData(month)
	if len(payments) == 0 {
		JSONErr(w, "No payment data for this month", http.StatusNotFound)
		return
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(10, 10, 10)
	pdf.AddPage()

	// Title
	pdf.SetFont("Helvetica", "B", 20)
	pdf.SetTextColor(0, 212, 255)
	pdf.CellFormat(190, 10, "GharSaathi", "", 1, "C", false, 0, "")

	// Subtitle
	pdf.SetFont("Helvetica", "", 12)
	pdf.SetTextColor(51, 51, 51)
	pdf.CellFormat(190, 8, "Payment Summary -- "+month, "", 1, "C", false, 0, "")
	pdf.Ln(3)

	// Summary stats
	totalGross, totalNet := 0.0, 0.0
	paid := 0
	for _, p := range payments {
		totalGross += p.GrossAmount
		totalNet += p.NetAmount
		if p.Status == "paid" {
			paid++
		}
	}
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(85, 85, 85)
	pdf.CellFormat(190, 6,
		fmt.Sprintf("Total Employees: %d   Paid: %d   Pending: %d", len(payments), paid, len(payments)-paid),
		"", 1, "L", false, 0, "")
	pdf.CellFormat(190, 6,
		fmt.Sprintf("Total Gross: %s   Total Net Payable: %s", fmtRs(totalGross), fmtRs(totalNet)),
		"", 1, "L", false, 0, "")
	pdf.Ln(3)

	// Table header
	cols := []float64{55, 22, 18, 25, 25, 25, 20}
	headers := []string{"Employee", "Pay Type", "Days", "Gross", "Advance", "Net", "Status"}

	pdf.SetFillColor(26, 26, 46)
	pdf.SetTextColor(0, 212, 255)
	pdf.SetFont("Helvetica", "B", 9)
	for i, h := range headers {
		ln := 0
		if i == len(headers)-1 {
			ln = 1
		}
		pdf.CellFormat(cols[i], 7, h, "", ln, "L", true, 0, "")
	}

	// Rows
	pdf.SetFont("Helvetica", "", 8)
	for i, p := range payments {
		if i%2 == 0 {
			pdf.SetFillColor(248, 248, 248)
		} else {
			pdf.SetFillColor(255, 255, 255)
		}
		pdf.SetTextColor(0, 0, 0)

		empName := ""
		if p.EmpName != nil {
			empName = *p.EmpName
		}
		payType := ""
		if p.EmpPayType != nil {
			payType = *p.EmpPayType
		}

		row := []string{
			empName,
			payType,
			strconv.FormatFloat(p.DaysWorked, 'f', 1, 64),
			fmtRs(p.GrossAmount),
			fmtRs(p.AdvanceDeducted),
			fmtRs(p.NetAmount),
			strings.ToUpper(p.Status),
		}
		for j, v := range row {
			ln := 0
			if j == len(row)-1 {
				ln = 1
			}
			pdf.CellFormat(cols[j], 6, v, "", ln, "L", true, 0, "")
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		JSONErr(w, "PDF generation failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="gharsaathi-`+month+`.pdf"`)
	w.Write(buf.Bytes())
}

func exportExcel(w http.ResponseWriter, r *http.Request) {
	month := monthSanitize.ReplaceAllString(chi.URLParam(r, "month"), "")
	payments := getPaymentData(month)

	var employees []empRow
	db.DB.Select(&employees, "SELECT id, name, pay_type FROM employees WHERE status='active' ORDER BY name")

	var attRows []attCell
	db.DB.Select(&attRows,
		"SELECT emp_id, date, status FROM attendance WHERE date LIKE ? ORDER BY date",
		month+"%")

	grid := make(map[string]map[string]string)
	for _, e := range employees {
		grid[e.ID] = make(map[string]string)
	}
	for _, a := range attRows {
		if grid[a.EmpID] != nil {
			grid[a.EmpID][a.Date] = a.Status
		}
	}

	f := excelize.NewFile()
	defer f.Close()

	// ── Sheet 1: Payment Summary ──────────────────────────────
	sheet1 := "Payment Summary"
	f.SetSheetName("Sheet1", sheet1)

	payHeaders := []string{"Employee", "Pay Type", "Days Worked", "Gross (Rs.)", "Advance (Rs.)", "Net (Rs.)", "Status", "Paid Date"}
	for i, h := range payHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet1, cell, h)
	}

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Color: "00D4FF"},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"1A1A2E"}, Pattern: 1},
	})
	for col := 1; col <= len(payHeaders); col++ {
		cell, _ := excelize.CoordinatesToCellName(col, 1)
		f.SetCellStyle(sheet1, cell, cell, headerStyle)
	}

	paidStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "00AA44"}})
	pendStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Color: "CC4400"}})

	for i, p := range payments {
		row := i + 2
		empName := ""
		if p.EmpName != nil {
			empName = *p.EmpName
		}
		payType := ""
		if p.EmpPayType != nil {
			payType = *p.EmpPayType
		}
		f.SetCellValue(sheet1, fmt.Sprintf("A%d", row), empName)
		f.SetCellValue(sheet1, fmt.Sprintf("B%d", row), payType)
		f.SetCellValue(sheet1, fmt.Sprintf("C%d", row), p.DaysWorked)
		f.SetCellValue(sheet1, fmt.Sprintf("D%d", row), p.GrossAmount)
		f.SetCellValue(sheet1, fmt.Sprintf("E%d", row), p.AdvanceDeducted)
		f.SetCellValue(sheet1, fmt.Sprintf("F%d", row), p.NetAmount)
		f.SetCellValue(sheet1, fmt.Sprintf("G%d", row), p.Status)
		if p.PaidDate != nil {
			f.SetCellValue(sheet1, fmt.Sprintf("H%d", row), *p.PaidDate)
		}
		statusCell := fmt.Sprintf("G%d", row)
		if p.Status == "paid" {
			f.SetCellStyle(sheet1, statusCell, statusCell, paidStyle)
		} else {
			f.SetCellStyle(sheet1, statusCell, statusCell, pendStyle)
		}
	}

	// Totals row
	totRow := len(payments) + 3
	f.SetCellValue(sheet1, fmt.Sprintf("A%d", totRow), "TOTAL")
	tGross, tAdv, tNet := 0.0, 0.0, 0.0
	for _, p := range payments {
		tGross += p.GrossAmount
		tAdv += p.AdvanceDeducted
		tNet += p.NetAmount
	}
	f.SetCellValue(sheet1, fmt.Sprintf("D%d", totRow), tGross)
	f.SetCellValue(sheet1, fmt.Sprintf("E%d", totRow), tAdv)
	f.SetCellValue(sheet1, fmt.Sprintf("F%d", totRow), tNet)
	boldStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for col := 1; col <= 8; col++ {
		cell, _ := excelize.CoordinatesToCellName(col, totRow)
		f.SetCellStyle(sheet1, cell, cell, boldStyle)
	}

	// ── Sheet 2: Attendance ───────────────────────────────────
	parts := strings.Split(month, "-")
	yr, _ := strconv.Atoi(parts[0])
	mo, _ := strconv.Atoi(parts[1])
	dim := time.Date(yr, time.Month(mo)+1, 0, 0, 0, 0, 0, time.UTC).Day()

	attSheet := "Attendance"
	f.NewSheet(attSheet)

	attHeaders := []string{"Employee", "Pay Type"}
	for d := 1; d <= dim; d++ {
		attHeaders = append(attHeaders, strconv.Itoa(d))
	}
	attHeaders = append(attHeaders, "Present", "Absent", "Half Day", "Days Worked")

	for i, h := range attHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(attSheet, cell, h)
	}
	attHeaderStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for col := 1; col <= len(attHeaders); col++ {
		cell, _ := excelize.CoordinatesToCellName(col, 1)
		f.SetCellStyle(attSheet, cell, cell, attHeaderStyle)
	}

	for rowIdx, emp := range employees {
		row := rowIdx + 2
		f.SetCellValue(attSheet, fmt.Sprintf("A%d", row), emp.Name)
		f.SetCellValue(attSheet, fmt.Sprintf("B%d", row), emp.PayType)
		present, absent, halfDay := 0, 0, 0
		for d := 1; d <= dim; d++ {
			dateStr := fmt.Sprintf("%s-%02d", month, d)
			status := "-"
			if s, ok := grid[emp.ID][dateStr]; ok {
				status = s
			}
			cell, _ := excelize.CoordinatesToCellName(d+2, row)
			f.SetCellValue(attSheet, cell, status)
			switch status {
			case "P":
				present++
			case "A":
				absent++
			case "H":
				halfDay++
			}
		}
		base := dim + 3
		pCell, _ := excelize.CoordinatesToCellName(base, row)
		aCell, _ := excelize.CoordinatesToCellName(base+1, row)
		hCell, _ := excelize.CoordinatesToCellName(base+2, row)
		wCell, _ := excelize.CoordinatesToCellName(base+3, row)
		f.SetCellValue(attSheet, pCell, present)
		f.SetCellValue(attSheet, aCell, absent)
		f.SetCellValue(attSheet, hCell, halfDay)
		f.SetCellValue(attSheet, wCell, float64(present)+float64(halfDay)*0.5)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		JSONErr(w, "Excel generation failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="gharsaathi-`+month+`.xlsx"`)
	w.Write(buf.Bytes())
}
