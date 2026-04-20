package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	chi "github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"gharsaathi/db"
	"gharsaathi/handlers"
)

func main() {
	if os.Getenv("JWT_SECRET") == "" {
		log.Fatal("JWT_SECRET env var is required")
	}
	db.Init()

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(securityHeaders)
	r.Use(corsMiddleware)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		handlers.JSONOk(w, map[string]string{"status": "ok", "ts": time.Now().Format(time.RFC3339)})
	})

	r.Route("/api/auth", handlers.AuthRoutes)
	r.Route("/api/employees", handlers.EmployeeRoutes)
	r.Route("/api/attendance", handlers.AttendanceRoutes)
	r.Route("/api/payments", handlers.PaymentRoutes)
	r.Route("/api/advances", handlers.AdvanceRoutes)
	r.Route("/api/export", handlers.ExportRoutes)
	r.Route("/api/documents", handlers.DocumentRoutes)
	r.Route("/api/activity", handlers.ActivityRoutes)

	publicDir := os.Getenv("PUBLIC_DIR")
	if publicDir == "" {
		publicDir = "/app/public"
	}
	if _, err := os.Stat(publicDir); err == nil {
		r.Get("/*", spaHandler(publicDir))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	log.Printf("GharSaathi running on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func spaHandler(publicDir string) http.HandlerFunc {
	fs := http.FileServer(http.Dir(publicDir))
	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(publicDir, filepath.Clean("/"+r.URL.Path))
		if _, err := os.Stat(path); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(publicDir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
				"font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; "+
				"object-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	origin := os.Getenv("CLIENT_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
