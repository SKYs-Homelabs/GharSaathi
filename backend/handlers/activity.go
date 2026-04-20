package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"gharsaathi/db"
	mw "gharsaathi/middleware"
)

type ActivityLogRow struct {
	ID         string  `db:"id"          json:"id"`
	UserID     *string `db:"user_id"     json:"user_id"`
	UserName   *string `db:"user_name"   json:"user_name"`
	Action     string  `db:"action"      json:"action"`
	EntityType *string `db:"entity_type" json:"entity_type"`
	EntityID   *string `db:"entity_id"   json:"entity_id"`
	Details    *string `db:"details"     json:"details"`
	CreatedAt  string  `db:"created_at"  json:"created_at"`
}

func ActivityRoutes(r chi.Router) {
	r.Use(mw.Authenticate)
	r.Get("/", listActivity)
}

func listActivity(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil {
			if n > 100 {
				n = 100
			}
			limit = n
		}
	}
	logs := []ActivityLogRow{}
	if err := db.DB.Select(&logs, "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?", limit); err != nil {
		JSONErr(w, "Server error", http.StatusInternalServerError)
		return
	}
	JSONOk(w, logs)
}
