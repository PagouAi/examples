package tests

import (
	"testing"

	"github.com/PagouAi/examples/go/internal/pagou"
)

func TestRedactMasksSensitiveKeys(t *testing.T) {
	out := pagou.Redact(map[string]any{
		"Authorization": "Bearer abc",
		"token":         "pgct_123",
		"amount":        4900,
	}).(map[string]any)

	if out["Authorization"] != "[REDACTED]" {
		t.Errorf("Authorization = %v, want [REDACTED]", out["Authorization"])
	}
	if out["token"] != "[REDACTED]" {
		t.Errorf("token = %v, want [REDACTED]", out["token"])
	}
	if out["amount"] != 4900 {
		t.Errorf("amount = %v, want 4900", out["amount"])
	}
}

func TestRedactMasksTokensInFreeText(t *testing.T) {
	if got := pagou.Redact("charge with pgct_secret123"); got != "charge with [REDACTED]" {
		t.Errorf("got %q, want charge with [REDACTED]", got)
	}
	if got := pagou.Redact("header Bearer sk_live_xyz here"); got != "header [REDACTED] here" {
		t.Errorf("got %q, want header [REDACTED] here", got)
	}
}

func TestRedactNestedStructures(t *testing.T) {
	out := pagou.Redact(map[string]any{
		"buyer": map[string]any{
			"name":     "Ana",
			"document": map[string]any{"number": "19100000000"},
		},
	}).(map[string]any)

	buyer := out["buyer"].(map[string]any)
	document := buyer["document"].(map[string]any)
	if buyer["name"] != "Ana" {
		t.Errorf("name = %v, want Ana", buyer["name"])
	}
	if document["number"] != "[REDACTED]" {
		t.Errorf("number = %v, want [REDACTED]", document["number"])
	}
}
