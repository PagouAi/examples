package tests

import (
	"errors"
	"net/http"
	"regexp"
	"testing"

	"github.com/PagouAi/examples/go/internal/pagou"
)

func TestUnwrapsDataEnvelope(t *testing.T) {
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		return jsonResponse(200, `{"success":true,"requestId":"req_1","data":{"id":"tx_1"}}`, nil), nil
	})

	res, err := pagou.RequestData[struct {
		ID string `json:"id"`
	}](client, pagou.RequestParams{Method: "GET", Path: "/v2/transactions/tx_1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Data.ID != "tx_1" {
		t.Errorf("data.id = %q, want tx_1", res.Data.ID)
	}
	if res.RequestID != "req_1" {
		t.Errorf("requestId = %q, want req_1", res.RequestID)
	}
}

func TestSendsAuthorizationAndCorrelationID(t *testing.T) {
	var captured *http.Request
	client := newClient(testConfig(), func(r *http.Request) (*http.Response, error) {
		captured = r
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{}}`, nil), nil
	})

	if _, err := pagou.RequestData[map[string]any](client, pagou.RequestParams{Method: "GET", Path: "/v2/transactions"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := captured.Header.Get("Authorization"); got != "Bearer test_token" {
		t.Errorf("Authorization = %q, want Bearer test_token", got)
	}
	if got := captured.Header.Get("X-Request-Id"); !regexp.MustCompile(`[0-9a-f-]{36}`).MatchString(got) {
		t.Errorf("X-Request-Id = %q, want a UUID", got)
	}
}

func TestMaps404WithoutRetry(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(404, `{"message":"not found","code":"NOT_FOUND"}`, nil), nil
	})

	_, err := pagou.RequestData[map[string]any](client, pagou.RequestParams{Method: "GET", Path: "/v2/transactions/x"})
	if !pagou.IsNotFound(err) {
		t.Fatalf("error = %v, want NotFound", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1", calls)
	}
}

func TestRetries500OnGetThenSucceeds(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			return jsonResponse(500, `{"message":"boom"}`, nil), nil
		}
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{"ok":true}}`, nil), nil
	})

	res, err := pagou.RequestData[struct {
		OK bool `json:"ok"`
	}](client, pagou.RequestParams{Method: "GET", Path: "/v2/transactions"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Data.OK {
		t.Errorf("data.ok = false, want true")
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2", calls)
	}
}

func TestDoesNotRetryPostWithoutIdempotencyKey(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(500, `{"message":"boom"}`, nil), nil
	})

	_, err := pagou.RequestData[map[string]any](client, pagou.RequestParams{Method: "POST", Path: "/v2/transactions", Body: map[string]any{}})
	if !pagou.IsKind(err, pagou.KindServer) {
		t.Fatalf("error = %v, want ServerError", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1", calls)
	}
}

func TestRetriesPostWithIdempotencyKey(t *testing.T) {
	calls := 0
	var firstKey string
	client := newClient(testConfig(), func(r *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			firstKey = r.Header.Get("Idempotency-Key")
			return jsonResponse(503, `{"message":"unavailable"}`, nil), nil
		}
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{"id":"tx"}}`, nil), nil
	})

	res, err := pagou.RequestData[struct {
		ID string `json:"id"`
	}](client, pagou.RequestParams{Method: "POST", Path: "/v2/transactions", Body: map[string]any{}, IdempotencyKey: "idem_1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Data.ID != "tx" {
		t.Errorf("data.id = %q, want tx", res.Data.ID)
	}
	if firstKey != "idem_1" {
		t.Errorf("Idempotency-Key = %q, want idem_1", firstKey)
	}
}

func TestRaisesNetworkErrorOnTimeout(t *testing.T) {
	cfg := testConfig()
	cfg.TimeoutMs = 30
	cfg.MaxRetries = 0
	client := newClient(cfg, func(r *http.Request) (*http.Response, error) {
		<-r.Context().Done()
		return nil, r.Context().Err()
	})

	_, err := pagou.RequestData[map[string]any](client, pagou.RequestParams{Method: "GET", Path: "/v2/transactions"})
	if !pagou.IsKind(err, pagou.KindNetwork) {
		t.Fatalf("error = %v, want NetworkError", err)
	}
	var apiErr *pagou.APIError
	if !errors.As(err, &apiErr) || apiErr.Message != "Request timed out" {
		t.Errorf("message = %v, want Request timed out", err)
	}
}

func TestSerializesArrayQueryParams(t *testing.T) {
	var captured *http.Request
	client := newClient(testConfig(), func(r *http.Request) (*http.Response, error) {
		captured = r
		return jsonResponse(200, `{"success":true,"requestId":"r","data":[],"next_cursor":null,"prev_cursor":null,"total":0}`, nil), nil
	})

	_, err := pagou.RequestCursorPage[map[string]any](client, pagou.RequestParams{
		Method: "GET",
		Path:   "/v2/transactions",
		Query:  map[string]any{"paymentMethods": []string{"pix", "credit_card"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := captured.URL.Query().Get("paymentMethods"); got != "pix,credit_card" {
		t.Errorf("paymentMethods = %q, want pix,credit_card", got)
	}
}
