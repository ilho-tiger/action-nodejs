package slack

import (
	"testing"
)

func Test_SendMessage(t *testing.T) {
	err := SendMessage("from unit test")
	if err != nil {
		t.Errorf("got %v", err)
	}
}

func Test_getWebhookURL(t *testing.T) {
	err := getWebhookURL()
	t.Log("value:", webhookURL)
	t.Log("err:", err)
}
