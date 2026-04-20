package db

import (
	"log"

	"github.com/google/uuid"
)

type ActivityUser struct {
	ID   string
	Name string
}

func LogActivity(user *ActivityUser, action, entityType, entityID, details string) {
	var uid, uname interface{}
	if user != nil {
		uid = user.ID
		uname = user.Name
	}
	_, err := DB.Exec(
		`INSERT INTO activity_log (id, user_id, user_name, action, entity_type, entity_id, details)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), uid, uname, action,
		nilIfEmpty(entityType), nilIfEmpty(entityID), nilIfEmpty(details),
	)
	if err != nil {
		log.Printf("activity log: %v", err)
	}
}

func nilIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
