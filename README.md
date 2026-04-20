<p align="center">
  <img src="client/public/logo.svg" alt="GharSaathi" width="260" />
</p>

<p align="center">
  <strong>Mobile-first web app to manage your household staff</strong><br/>
  Attendance · Salaries · Advances · Documents · Reports
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.23-00ADD8?logo=go" />
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" />
  <img src="https://img.shields.io/badge/SQLite-local-orange?logo=sqlite" />
  <img src="https://img.shields.io/badge/Docker-multi--stage-2496ED?logo=docker" />
</p>

---

## Features

### Staff Management
- Add/edit employee profiles with photo, contact details, join date
- Two pay types: **Daily rate** (paid per day worked) or **Monthly salary** (prorated from attendance)
- Mark employees active/inactive

### Attendance
- Daily marking — **Present**, **Absent**, **Half Day** per employee
- Monthly grid view with per-employee totals
- **Undo attendance** with optional reason (logged to activity)
- Dashboard attendance calendar with colour-coded dots per day

### Payments
- Auto-calculate gross from attendance (daily × days worked, or monthly prorated)
- Pending advance amounts auto-deducted from salary
- Mark payments as paid — advance records atomically updated in same transaction
- Monthly payment sheet with gross / advance / net breakdown

### Advances
- Log advance payments per employee with date and notes
- Auto-deducted when salary is marked paid
- Pending advance totals shown on employee profile and dashboard

### Documents
- Upload multiple files per employee (PDF, images, Word — max 10 MB each)
- Drag-and-drop or click-to-browse upload
- View/download inline, delete with confirmation
- MIME type + extension cross-validated on upload

### Export
- **PDF** — payment summary with totals, formatted table
- **Excel (.xlsx)** — Sheet 1: payment breakdown; Sheet 2: full attendance grid

### Dashboard
- Live stats: active staff, present today, pending payments, unmarked count
- **Attendance calendar** — monthly view with green/yellow/red dots per day
- **Recent activity feed** — last 15 actions with actor and timestamp

### Users & Auth
- JWT-based auth with httpOnly cookies
- **First-run setup** — registration open only until the first admin is created; locked after that
- Admin can add/remove users from the Users modal (key icon in topbar)
- Three roles:

| Role | Permissions |
|------|-------------|
| `admin` | Full access — manage employees, payments, users, documents |
| `viewer` | Mark attendance, add advances, view all data |
| `readonly` | View only — all write operations blocked |

- Per-user password change (key icon in topbar)

### Security Hardening
- Helmet with restrictive CSP (self + Google Fonts only)
- Registration wrapped in SQLite transaction — no TOCTOU race
- JWT_SECRET validated at startup — server refuses to start if unset
- `Content-Disposition` filenames sanitized to prevent header injection
- JSON body limit capped at 1 MB (multipart handled separately)
- Advance deductions + payment status update in a single atomic transaction
- Activity log errors surfaced to console (never silently swallowed)
- Deleted-user JWT results in 401, not a crash

---

## Quick Start (Docker)

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (required)

# 2. Start
docker compose up -d

# 3. Open
# http://localhost:36727
# First visit → create admin account
```

---

## Development Setup

### Prerequisites
- Go 1.23+
- Node.js 20+

### Backend
```bash
cd backend
go mod tidy
go run .             # runs on port 3000
```

### Client
```bash
cd client
npm install
npm run dev          # Vite on port 5173 — proxies /api to port 3000
```

---

## Docker

### Multi-stage build

| Stage | Base | Purpose |
|-------|------|---------|
| `frontend-builder` | `node:20-alpine` | `npm run build` → static assets |
| `backend-builder` | `golang:1.23-alpine` | `CGO_ENABLED=0 go build` → single static binary |
| `final` | `alpine:3.20` | Copies binary + public dir (~35 MB) |

### Build manually
```bash
docker build -t gharsaathi .
docker run -p 3000:3000 -v $(pwd)/data:/app/data --env-file .env gharsaathi
```

### Data persistence
SQLite database and uploaded documents are stored in the mounted volume:
```
./gharsaathi/           → /app/data  (database + documents)
```

---

## GitHub Actions

Push to `main` or tag `v*.*.*` → builds and pushes image to `ghcr.io/<owner>/gharsaathi`.

- Multi-platform: `linux/amd64` + `linux/arm64`
- Layer cache via `type=gha` (GitHub Actions cache) — fast incremental rebuilds
- PRs build without pushing
- `GITHUB_TOKEN` used automatically — no manual secrets needed

## Dependabot

Weekly dependency updates for:
- `client/` npm packages (grouped: react ecosystem, vite ecosystem)
- `backend/` Go modules
- Docker base image

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | **Yes** | Long random string. Server refuses to start if unset. |
| `PORT` | `3000` | No | Server listen port |
| `JWT_EXPIRES_IN` | `7d` | No | Token lifetime |
| `DB_PATH` | `./data/gharsaathi.db` | No | SQLite file path |
| `UPLOAD_DIR` | `<DB_PATH dir>/documents` | No | Document storage directory |
| `COOKIE_SECURE` | `false` | No | Set to `true` only when serving over HTTPS |
| `CLIENT_ORIGIN` | `http://localhost:5173` | No | CORS allowed origin (dev only; not needed in production Docker) |

---

## Project Structure

```
├── client/
│   ├── public/
│   │   ├── favicon.svg          GS gradient icon
│   │   └── logo.svg             Full logo with wordmark
│   └── src/
│       ├── components/
│       │   ├── common/          PasswordModal, UsersModal
│       │   ├── dashboard/       AttendanceCalendar, RecentActivity
│       │   ├── employees/       EmployeeFormModal, DocumentsSection
│       │   └── layout/          Layout, Sidebar, Topbar
│       ├── context/             AuthContext, ThemeContext
│       ├── pages/               Dashboard, Employees, Attendance,
│       │                        Payments, Advances, Export
│       └── api/                 Axios client
├── backend/
│   ├── db/
│   │   ├── db.go                sqlx init, embedded schema (WAL + FK), SetMaxOpenConns(1)
│   │   └── activity.go          Audit log helper
│   ├── middleware/
│   │   └── auth.go              Authenticate, RequireAdmin, RequireWrite, GetClaims
│   ├── handlers/
│   │   ├── helpers.go           JSONOk / JSONCreated / JSONErr / JSONMsg
│   │   ├── auth.go              login, register, users CRUD, change-password
│   │   ├── employees.go
│   │   ├── attendance.go        mark, undo, daily-summary, monthly-summary
│   │   ├── payments.go          generate, pay, notes
│   │   ├── advances.go
│   │   ├── documents.go         upload, download, delete
│   │   ├── export.go            PDF (gofpdf) + Excel (excelize)
│   │   └── activity.go          audit log feed
│   ├── main.go                  chi router, SPA handler, security headers
│   ├── go.mod
│   └── go.sum
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       └── docker-publish.yml
├── Dockerfile                   3-stage multi-arch build
├── docker-compose.yml
├── .env.example
└── .gitignore
```

---

## TODO

_Planned features:_

- [ ] Milkman
- [ ] Newspaper

---

## License

MIT
