package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

func JSONOk(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode: %v", err)
	}
}

func JSONCreated(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode: %v", err)
	}
}

func JSONErr(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": msg}); err != nil {
		log.Printf("json encode error response: %v", err)
	}
}

func JSONMsg(w http.ResponseWriter, msg string) {
	JSONOk(w, map[string]string{"message": msg})
}
