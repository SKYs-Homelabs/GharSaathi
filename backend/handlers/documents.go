package handlers

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

func itoa(n int) string { return strconv.Itoa(n) }

type DocumentRow struct {
	ID           string  `db:"id"            json:"id"`
	EmpID        string  `db:"emp_id"        json:"emp_id"`
	Filename     string  `db:"filename"      json:"filename"`
	OriginalName string  `db:"original_name" json:"original_name"`
	Mimetype     *string `db:"mimetype"      json:"mimetype"`
	Size         *int64  `db:"size"          json:"size"`
	UploadedBy   *string `db:"uploaded_by"   json:"uploaded_by"`
	CreatedAt    string  `db:"created_at"    json:"created_at"`
}

var allowedExts = map[string][]string{
	".pdf":  {"application/pdf"},
	".jpg":  {"image/jpeg"},
	".jpeg": {"image/jpeg"},
	".png":  {"image/png"},
	".webp": {"image/webp"},
	// Office formats: http.DetectContentType returns application/zip for .docx
	// and application/octet-stream for .doc, so content sniffing is unreliable.
	// Extension-only check is acceptable since files are never executed.
	".doc":  {"application/msword"},
	".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
}

// sniffable are types where http.DetectContentType gives a reliable result.
var sniffable = map[string]bool{
	".pdf":  true,
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
}

var safeFilenameRe = regexp.MustCompile(`[^\w.\-]`)

func safeFilename(name string) string {
	base := filepath.Base(name)
	safe := safeFilenameRe.ReplaceAllString(base, "_")
	if safe == "" {
		return "document"
	}
	return safe
}

func getUploadDir() string {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/app/data/gharsaathi.db"
	}
	if d := os.Getenv("UPLOAD_DIR"); d != "" {
		return d
	}
	return filepath.Join(filepath.Dir(dbPath), "documents")
}

func DocumentRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/file/{docId}", getFile)
	r.Get("/{empId}", listDocuments)
	r.With(mw.RequireAdmin).Post("/{empId}", uploadDocuments)
	r.With(mw.RequireAdmin).Delete("/{docId}", deleteDocument)
}

func listDocuments(w http.ResponseWriter, r *http.Request) {
	empID := chi.URLParam(r, "empId")
	docs := []DocumentRow{}
	if err := db.DB.Select(&docs, "SELECT * FROM documents WHERE emp_id = ? ORDER BY created_at DESC", empID); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, docs)
}

func uploadDocuments(w http.ResponseWriter, r *http.Request) {
	empID := chi.URLParam(r, "empId")
	var emp struct {
		ID   string `db:"id"`
		Name string `db:"name"`
	}
	if err := db.DB.Get(&emp, "SELECT id, name FROM employees WHERE id = ?", empID); err != nil {
		JSONErr(w, "Employee not found", http.StatusNotFound)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		JSONErr(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		JSONErr(w, "No files uploaded", http.StatusBadRequest)
		return
	}

	uDir := getUploadDir()
	if err := os.MkdirAll(uDir, 0755); err != nil {
		JSONErr(w, "Failed to create upload directory", http.StatusInternalServerError)
		return
	}

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	claims := mw.GetClaims(r)

	// Track written files so we can clean up if the DB commit fails.
	var writtenFiles []string
	defer func() {
		for _, path := range writtenFiles {
			os.Remove(path)
		}
	}()

	for _, fh := range files {
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		allowedMimes, ok := allowedExts[ext]
		if !ok {
			JSONErr(w, "Unsupported file type: "+ext, http.StatusBadRequest)
			return
		}

		f, err := fh.Open()
		if err != nil {
			JSONErr(w, "Failed to read file", http.StatusInternalServerError)
			return
		}

		// Sniff actual content type for types where detection is reliable.
		// Office formats (.doc/.docx) are excluded — DetectContentType can't
		// distinguish them from generic binary/zip.
		detectedMime := fh.Header.Get("Content-Type") // fallback for non-sniffable
		if sniffable[ext] {
			header := make([]byte, 512)
			n, _ := f.Read(header)
			detectedMime = http.DetectContentType(header[:n])
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				f.Close()
				JSONErr(w, "Failed to read file", http.StatusInternalServerError)
				return
			}
		}

		mimeOk := false
		for _, m := range allowedMimes {
			if strings.HasPrefix(detectedMime, m) {
				mimeOk = true
				break
			}
		}
		if !mimeOk {
			f.Close()
			JSONErr(w, "File content does not match allowed type for "+fh.Filename, http.StatusBadRequest)
			return
		}

		storedName := uuid.New().String() + ext
		dest := filepath.Join(uDir, storedName)
		out, err := os.Create(dest)
		if err != nil {
			f.Close()
			JSONErr(w, "Failed to save file", http.StatusInternalServerError)
			return
		}
		_, copyErr := io.Copy(out, f)
		out.Close()
		f.Close()
		if copyErr != nil {
			os.Remove(dest)
			JSONErr(w, "Failed to write file", http.StatusInternalServerError)
			return
		}
		writtenFiles = append(writtenFiles, dest)

		id := uuid.New().String()
		if _, err := tx.Exec(
			"INSERT INTO documents (id, emp_id, filename, original_name, mimetype, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
			id, empID, storedName, fh.Filename, detectedMime, fh.Size, claims.Name,
		); err != nil {
			os.Remove(dest)
			JSONErr(w, "Failed to save document record", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	writtenFiles = nil // commit succeeded — don't clean up on defer

	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
		"upload_documents", "employee", empID,
		itoa(len(files))+" file(s) for "+emp.Name)

	var docs []DocumentRow
	db.DB.Select(&docs, "SELECT * FROM documents WHERE emp_id = ? ORDER BY created_at DESC", empID)
	JSONCreated(w, docs)
}

func getFile(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "docId")
	var doc DocumentRow
	if err := db.DB.Get(&doc, "SELECT * FROM documents WHERE id = ?", docID); err != nil {
		JSONErr(w, "Document not found", http.StatusNotFound)
		return
	}
	filePath := filepath.Join(getUploadDir(), doc.Filename)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		JSONErr(w, "File not found on disk", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Disposition", `inline; filename="`+safeFilename(doc.OriginalName)+`"`)
	http.ServeFile(w, r, filePath)
}

func deleteDocument(w http.ResponseWriter, r *http.Request) {
	docID := chi.URLParam(r, "docId")
	var doc DocumentRow
	if err := db.DB.Get(&doc, "SELECT * FROM documents WHERE id = ?", docID); err != nil {
		JSONErr(w, "Document not found", http.StatusNotFound)
		return
	}
	filePath := filepath.Join(getUploadDir(), doc.Filename)
	os.Remove(filePath)
	if _, err := db.DB.Exec("DELETE FROM documents WHERE id = ?", docID); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	claims := mw.GetClaims(r)
	db.LogActivity(&db.ActivityUser{ID: claims.ID, Name: claims.Name},
		"delete_document", "employee", doc.EmpID, doc.OriginalName)

	JSONMsg(w, "Deleted")
}
