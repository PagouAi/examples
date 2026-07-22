package tests

import (
	"net/http"
	"testing"

	"github.com/PagouAi/examples/go/internal/pagou"
	"github.com/PagouAi/examples/go/webhooks"
)

func TestFormatAmount(t *testing.T) {
	if got := pagou.FormatAmount(4900, "BRL"); got != "BRL 49.00" {
		t.Errorf("FormatAmount(4900, BRL) = %q", got)
	}
	if got := pagou.FormatAmount(50, ""); got != "BRL 0.50" {
		t.Errorf("FormatAmount(50, \"\") = %q", got)
	}
}

func TestIdempotencyKey(t *testing.T) {
	if got := pagou.IdempotencyKey("refund", "tx_1_full"); got != "refund_tx_1_full" {
		t.Errorf("IdempotencyKey = %q", got)
	}
}

func TestIsTransferCancelable(t *testing.T) {
	if !pagou.IsTransferCancelable("pending") || !pagou.IsTransferCancelable("scheduled") {
		t.Error("pending/scheduled should be cancelable")
	}
	if pagou.IsTransferCancelable("processing") || pagou.IsTransferCancelable("paid") {
		t.Error("processing/paid should not be cancelable")
	}
}

func TestHasProcessed(t *testing.T) {
	store := webhooks.NewStore()
	if store.HasProcessed("evt") {
		t.Error("unseen event should not be processed")
	}
	store.MarkProcessed("evt")
	if !store.HasProcessed("evt") {
		t.Error("seen event should be processed")
	}
}

func TestErrorMappingByStatus(t *testing.T) {
	cases := []struct {
		status int
		kind   pagou.ErrorKind
	}{
		{401, pagou.KindAuthentication},
		{403, pagou.KindPermission},
		{409, pagou.KindConflict},
		{429, pagou.KindRateLimit},
		{422, pagou.KindInvalidRequest},
	}
	for _, c := range cases {
		// A single non-retryable attempt: 401/403/409/422 aren't retryable, and
		// 429 on a POST without an idempotency key isn't retried either.
		client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
			return jsonResponse(c.status, `{"message":"nope","code":"X"}`, nil), nil
		})
		_, err := pagou.RequestData[map[string]any](client, pagou.RequestParams{Method: "POST", Path: "/v2/x", Body: map[string]any{}})
		if !pagou.IsKind(err, c.kind) {
			t.Errorf("status %d mapped to %v, want %s", c.status, err, c.kind)
		}
	}
}
