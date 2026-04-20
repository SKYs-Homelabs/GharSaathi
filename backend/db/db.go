package db

import (
	"log"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

var DB *sqlx.DB

// Each statement runs individually to avoid multi-statement exec ambiguity
// with modernc.org/sqlite (sqlite3_prepare_v2 compiles one statement at a time).
var initStatements = []string{
	"PRAGMA journal_mode = WAL",
	"PRAGMA foreign_keys = ON",
	"PRAGMA busy_timeout = 5000",

	`CREATE TABLE IF NOT EXISTS users (
	  id         TEXT PRIMARY KEY,
	  name       TEXT NOT NULL,
	  email      TEXT UNIQUE NOT NULL,
	  password   TEXT NOT NULL,
	  role       TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','viewer','readonly')),
	  created_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS employees (
	  id             TEXT PRIMARY KEY,
	  name           TEXT NOT NULL,
	  phone          TEXT,
	  address        TEXT,
	  photo          TEXT,
	  pay_type       TEXT NOT NULL DEFAULT 'MONTHLY' CHECK(pay_type IN ('MONTHLY','DAILY')),
	  monthly_salary REAL,
	  daily_rate     REAL,
	  join_date      TEXT NOT NULL,
	  status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
	  notes          TEXT,
	  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
	  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS attendance (
	  id         TEXT PRIMARY KEY,
	  emp_id     TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	  date       TEXT NOT NULL,
	  status     TEXT NOT NULL DEFAULT 'P' CHECK(status IN ('P','A','H')),
	  notes      TEXT,
	  created_at TEXT NOT NULL DEFAULT (datetime('now')),
	  UNIQUE(emp_id, date)
	)`,

	`CREATE TABLE IF NOT EXISTS payments (
	  id                TEXT PRIMARY KEY,
	  emp_id            TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	  month             TEXT NOT NULL,
	  days_worked       REAL NOT NULL DEFAULT 0,
	  gross_amount      REAL NOT NULL DEFAULT 0,
	  advance_deducted  REAL NOT NULL DEFAULT 0,
	  net_amount        REAL NOT NULL DEFAULT 0,
	  status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
	  paid_date         TEXT,
	  notes             TEXT,
	  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
	  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
	  UNIQUE(emp_id, month)
	)`,

	`CREATE TABLE IF NOT EXISTS advances (
	  id          TEXT PRIMARY KEY,
	  emp_id      TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	  date        TEXT NOT NULL,
	  amount      REAL NOT NULL,
	  deducted    INTEGER NOT NULL DEFAULT 0,
	  deducted_in TEXT,
	  notes       TEXT,
	  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS documents (
	  id            TEXT PRIMARY KEY,
	  emp_id        TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	  filename      TEXT NOT NULL,
	  original_name TEXT NOT NULL,
	  mimetype      TEXT,
	  size          INTEGER,
	  uploaded_by   TEXT,
	  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
	)`,

	`CREATE TABLE IF NOT EXISTS activity_log (
	  id          TEXT PRIMARY KEY,
	  user_id     TEXT,
	  user_name   TEXT,
	  action      TEXT NOT NULL,
	  entity_type TEXT,
	  entity_id   TEXT,
	  details     TEXT,
	  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
	)`,

	`CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(emp_id, date)`,
	`CREATE INDEX IF NOT EXISTS idx_payments_emp_month  ON payments(emp_id, month)`,
	`CREATE INDEX IF NOT EXISTS idx_advances_emp        ON advances(emp_id)`,
	`CREATE INDEX IF NOT EXISTS idx_documents_emp       ON documents(emp_id)`,
	`CREATE INDEX IF NOT EXISTS idx_activity_created    ON activity_log(created_at DESC)`,
}

func Init() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/gharsaathi.db"
	}

	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	var err error
	DB, err = sqlx.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	DB.SetMaxOpenConns(1)

	for _, stmt := range initStatements {
		if _, err := DB.Exec(stmt); err != nil {
			log.Fatalf("db init failed:\n%s\nerror: %v", stmt, err)
		}
	}
}
