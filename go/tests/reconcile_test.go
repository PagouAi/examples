package tests

import (
	"net/http"
	"testing"

	"github.com/PagouAi/examples/go/internal/pagou"
)

func TestDecideFulfillment(t *testing.T) {
	fulfill := []pagou.TransactionStatus{"paid", "captured"}
	for _, s := range fulfill {
		if got := pagou.DecideFulfillment(s); got != pagou.Fulfill {
			t.Errorf("DecideFulfillment(%s) = %s, want fulfill", s, got)
		}
	}
	wait := []pagou.TransactionStatus{"pending", "three_ds_required", "processing"}
	for _, s := range wait {
		if got := pagou.DecideFulfillment(s); got != pagou.Wait {
			t.Errorf("DecideFulfillment(%s) = %s, want wait", s, got)
		}
	}
	cancel := []pagou.TransactionStatus{"expired", "refused", "canceled"}
	for _, s := range cancel {
		if got := pagou.DecideFulfillment(s); got != pagou.Cancel {
			t.Errorf("DecideFulfillment(%s) = %s, want cancel", s, got)
		}
	}
}

func TestReconcileTransactionReturnsDecision(t *testing.T) {
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{"id":"tx_1","status":"paid"}}`, nil), nil
	})

	result, err := pagou.ReconcileTransaction(client, "tx_1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil || result.Decision != pagou.Fulfill {
		t.Fatalf("decision = %v, want fulfill", result)
	}
	if result.Transaction.Status != "paid" {
		t.Errorf("status = %q, want paid", result.Transaction.Status)
	}
}

func TestReconcileTransactionReturnsNilWhenMissing(t *testing.T) {
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		return jsonResponse(404, `{"message":"not found"}`, nil), nil
	})

	result, err := pagou.ReconcileTransaction(client, "missing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != nil {
		t.Errorf("result = %v, want nil", result)
	}
}
