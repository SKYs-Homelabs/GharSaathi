package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey int

const userKey contextKey = 0

// Cached at startup; main.go guarantees JWT_SECRET is non-empty before Init runs.
var jwtKey = []byte(os.Getenv("JWT_SECRET"))

type Claims struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

func Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenStr := tokenFromRequest(r)
		if tokenStr == "" {
			jsonErr(w, "Authentication required", http.StatusUnauthorized)
			return
		}
		claims := &Claims{}
		tok, err := jwt.ParseWithClaims(tokenStr, claims, keyFunc,
			jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !tok.Valid {
			jsonErr(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, claims)))
	})
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c := GetClaims(r); c == nil || c.Role != "admin" {
			jsonErr(w, "Admin access required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireWrite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c := GetClaims(r); c.Role == "readonly" {
			jsonErr(w, "Read-only access: you cannot make changes", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func GetClaims(r *http.Request) *Claims {
	c, _ := r.Context().Value(userKey).(*Claims)
	return c
}

func tokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie("token"); err == nil {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return h[7:]
	}
	return ""
}

func keyFunc(t *jwt.Token) (interface{}, error) {
	return jwtKey, nil
}

func jsonErr(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
