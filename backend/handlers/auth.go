package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	chi "github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

type userRow struct {
	ID        string `db:"id"         json:"id"`
	Name      string `db:"name"       json:"name"`
	Email     string `db:"email"      json:"email"`
	Role      string `db:"role"       json:"role"`
	CreatedAt string `db:"created_at" json:"created_at"`
}

func AuthRoutes(r chi.Router) {
	r.Get("/setup-status", setupStatus)
	r.Post("/register", register)
	r.Post("/login", login)
	r.Post("/logout", logout)
	r.With(mw.Authenticate).Get("/me", me)
	r.With(mw.Authenticate, mw.RequireAdmin).Get("/users", listUsers)
	r.With(mw.Authenticate, mw.RequireAdmin).Post("/users", createUser)
	r.With(mw.Authenticate, mw.RequireAdmin).Delete("/users/{id}", deleteUser)
	r.With(mw.Authenticate).Post("/change-password", changePassword)
}

func parseExpiry(val string) time.Duration {
	if len(val) < 2 {
		return 7 * 24 * time.Hour
	}
	units := map[byte]time.Duration{
		's': time.Second,
		'm': time.Minute,
		'h': time.Hour,
		'd': 24 * time.Hour,
	}
	unit, ok := units[val[len(val)-1]]
	if !ok {
		return 7 * 24 * time.Hour
	}
	n, err := strconv.Atoi(val[:len(val)-1])
	if err != nil || n <= 0 {
		return 7 * 24 * time.Hour
	}
	return time.Duration(n) * unit
}

func issueToken(user userRow, w http.ResponseWriter) error {
	expiry := parseExpiry(os.Getenv("JWT_EXPIRES_IN"))
	claims := mw.Claims{
		ID:    user.ID,
		Name:  user.Name,
		Email: user.Email,
		Role:  user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		JSONErr(w, "Token signing failed", http.StatusInternalServerError)
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    tokenStr,
		HttpOnly: true,
		Secure:   os.Getenv("COOKIE_SECURE") == "true",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(expiry.Seconds()),
		Path:     "/",
	})
	return nil
}

func setupStatus(w http.ResponseWriter, r *http.Request) {
	var count int
	if err := db.DB.Get(&count, "SELECT COUNT(*) FROM users"); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, map[string]bool{"configured": count > 0})
}

func register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Email == "" || body.Password == "" {
		JSONErr(w, "All fields required", http.StatusBadRequest)
		return
	}
	if len(body.Password) > 128 {
		JSONErr(w, "Password must be at most 128 characters", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 12)
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	tx, err := db.DB.Beginx()
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	var count int
	if err := tx.Get(&count, "SELECT COUNT(*) FROM users"); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	if count > 0 {
		JSONErr(w, "Registration is disabled. Ask your admin to create an account.", http.StatusForbidden)
		return
	}

	id := uuid.New().String()
	if _, err := tx.Exec(
		"INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
		id, body.Name, body.Email, string(hash), "admin",
	); err != nil {
		JSONErr(w, "Email already registered", http.StatusConflict)
		return
	}
	if err := tx.Commit(); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}

	var user userRow
	if err := db.DB.Get(&user, "SELECT id, name, email, role, created_at FROM users WHERE id = ?", id); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	if err := issueToken(user, w); err != nil {
		return
	}
	JSONCreated(w, user)
}

func login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		JSONErr(w, "Email and password required", http.StatusBadRequest)
		return
	}

	var user struct {
		ID       string `db:"id"`
		Name     string `db:"name"`
		Email    string `db:"email"`
		Password string `db:"password"`
		Role     string `db:"role"`
	}
	if err := db.DB.Get(&user, "SELECT id, name, email, password, role FROM users WHERE email = ?", body.Email); err != nil {
		JSONErr(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(body.Password)); err != nil {
		JSONErr(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	u := userRow{ID: user.ID, Name: user.Name, Email: user.Email, Role: user.Role}
	if err := issueToken(u, w); err != nil {
		return
	}
	JSONOk(w, u)
}

func logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		HttpOnly: true,
		MaxAge:   -1,
		Path:     "/",
	})
	JSONMsg(w, "Logged out")
}

func me(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	var user userRow
	if err := db.DB.Get(&user, "SELECT id, name, email, role, created_at FROM users WHERE id = ?", claims.ID); err != nil {
		JSONErr(w, "User not found", http.StatusNotFound)
		return
	}
	JSONOk(w, user)
}

func listUsers(w http.ResponseWriter, r *http.Request) {
	var users []userRow
	if err := db.DB.Select(&users, "SELECT id, name, email, role, created_at FROM users"); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, users)
}

func createUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Email == "" || body.Password == "" {
		JSONErr(w, "name, email, password required", http.StatusBadRequest)
		return
	}
	if len(body.Password) > 128 {
		JSONErr(w, "Password must be at most 128 characters", http.StatusBadRequest)
		return
	}
	valid := map[string]bool{"admin": true, "viewer": true, "readonly": true}
	if !valid[body.Role] {
		JSONErr(w, "Invalid role", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 12)
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	id := uuid.New().String()
	if _, err := db.DB.Exec(
		"INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
		id, body.Name, body.Email, string(hash), body.Role,
	); err != nil {
		JSONErr(w, "Email already registered", http.StatusConflict)
		return
	}

	var user userRow
	if err := db.DB.Get(&user, "SELECT id, name, email, role, created_at FROM users WHERE id = ?", id); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONCreated(w, user)
}

func deleteUser(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	id := chi.URLParam(r, "id")
	if id == claims.ID {
		JSONErr(w, "Cannot delete your own account", http.StatusBadRequest)
		return
	}
	result, err := db.DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		JSONErr(w, "User not found", http.StatusNotFound)
		return
	}
	JSONMsg(w, "User deleted")
}

func changePassword(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CurrentPassword == "" || body.NewPassword == "" {
		JSONErr(w, "Both fields required", http.StatusBadRequest)
		return
	}
	if len(body.NewPassword) < 6 || len(body.NewPassword) > 128 {
		JSONErr(w, "New password must be 6–128 characters", http.StatusBadRequest)
		return
	}

	var stored struct {
		Password string `db:"password"`
	}
	if err := db.DB.Get(&stored, "SELECT password FROM users WHERE id = ?", claims.ID); err != nil {
		JSONErr(w, "User not found", http.StatusUnauthorized)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(stored.Password), []byte(body.CurrentPassword)); err != nil {
		JSONErr(w, "Current password is incorrect", http.StatusUnauthorized)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), 12)
	if err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	if _, err := db.DB.Exec("UPDATE users SET password = ? WHERE id = ?", string(hash), claims.ID); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONMsg(w, "Password changed successfully")
}
