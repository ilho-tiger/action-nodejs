package slack

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
)

const (
	webhookURL = "https://hooks.slack.com/services/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"
)

// SendMessage will send given message as a Slack incoming webhook
func SendMessage(message string) int {
	requestBody, err := json.Marshal(map[string]string{
		"text": message,
	})

	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(requestBody))
	if err != nil {
		log.Fatalln(err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}
