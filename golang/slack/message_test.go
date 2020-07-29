package slack

import "testing"

func TestSendMessage(t *testing.T) {
	expected := 200
	actual := SendMessage("from unit test")
	if actual != expected {
		t.Errorf("expecting %v but got %v", expected, actual)
	}
}
