package tests

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/PagouAi/examples/go/webhooks"
)

func loadFixture(t *testing.T, name string) any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("fixtures", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode fixture %s: %v", name, err)
	}
	return out
}

func TestParseWebhookTransactionFamily(t *testing.T) {
	event, perr := webhooks.ParseWebhook(map[string]any{
		"id": "evt_1", "event": "transaction",
		"data": map[string]any{"id": "tx_1", "event_type": "transaction.paid"},
	})
	if perr != "" {
		t.Fatalf("parse error: %v", perr)
	}
	if event.Family != webhooks.FamilyTransaction || event.EventType != "transaction.paid" || event.ResourceID != "tx_1" {
		t.Errorf("unexpected event: %+v", event)
	}
}

func TestParseWebhookSubscriptionFamily(t *testing.T) {
	event, _ := webhooks.ParseWebhook(map[string]any{
		"id": "evt_2", "event": "subscription",
		"data": map[string]any{"id": "sub_1", "event_type": "subscription.renewed"},
	})
	if event.Family != webhooks.FamilySubscription || event.EventType != "subscription.renewed" || event.ResourceID != "sub_1" {
		t.Errorf("unexpected event: %+v", event)
	}
}

func TestParseWebhookTransferFamily(t *testing.T) {
	event, _ := webhooks.ParseWebhook(map[string]any{
		"id": "evt_3", "type": "payout.transferred",
		"data": map[string]any{"object": map[string]any{"id": "tr_1"}},
	})
	if event.Family != webhooks.FamilyTransfer || event.EventType != "payout.transferred" || event.ResourceID != "tr_1" {
		t.Errorf("unexpected event: %+v", event)
	}
}

func TestParseWebhookRejectsMissingID(t *testing.T) {
	_, perr := webhooks.ParseWebhook(map[string]any{"event": "transaction", "data": map[string]any{}})
	if perr != webhooks.ErrMissingEventID {
		t.Errorf("parse error = %q, want missing_event_id", perr)
	}
}

func TestParseWebhookFixtures(t *testing.T) {
	for _, name := range []string{"webhook.transaction.json", "webhook.subscription.json", "webhook.transfer.json"} {
		if _, perr := webhooks.ParseWebhook(loadFixture(t, name)); perr != "" {
			t.Errorf("%s: parse error %q", name, perr)
		}
	}
}

func TestIsConfirmedStateChange(t *testing.T) {
	confirmed := []string{"transaction.paid", "payout.transferred"}
	for _, e := range confirmed {
		if !webhooks.IsConfirmedStateChange(e) {
			t.Errorf("%s should be confirmed", e)
		}
	}
	informational := []string{"transaction.created", "subscription.trial_will_end"}
	for _, e := range informational {
		if webhooks.IsConfirmedStateChange(e) {
			t.Errorf("%s should not be confirmed", e)
		}
	}
}

func TestDedupe(t *testing.T) {
	store := webhooks.NewStore()
	if !store.MarkProcessed("evt_x") {
		t.Error("first MarkProcessed = false, want true")
	}
	if store.MarkProcessed("evt_x") {
		t.Error("redelivery MarkProcessed = true, want false")
	}
}

func TestProcessEventReconcilesOnConfirmed(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{"status":"paid"}}`, nil), nil
	})
	store := webhooks.NewStore()

	err := webhooks.ProcessEvent(client, store, webhooks.Event{
		ID: "evt_1", Family: webhooks.FamilyTransaction, EventType: "transaction.paid", ResourceID: "tx_1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1", calls)
	}
	if state, _ := store.ResourceState("tx_1"); state != "paid" {
		t.Errorf("state = %q, want paid", state)
	}
}

func TestProcessEventIgnoresNonConfirming(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{}}`, nil), nil
	})
	store := webhooks.NewStore()

	if err := webhooks.ProcessEvent(client, store, webhooks.Event{
		ID: "evt_2", Family: webhooks.FamilyTransaction, EventType: "transaction.created", ResourceID: "tx_2",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 0 {
		t.Errorf("calls = %d, want 0", calls)
	}
	if _, ok := store.ResourceState("tx_2"); ok {
		t.Error("state for tx_2 should be unset")
	}
}

func TestProcessEventSkipsWhenNoResourceID(t *testing.T) {
	calls := 0
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(200, `{"success":true,"requestId":"r","data":{}}`, nil), nil
	})
	store := webhooks.NewStore()

	if err := webhooks.ProcessEvent(client, store, webhooks.Event{
		ID: "evt_3", Family: webhooks.FamilyTransaction, EventType: "transaction.paid", ResourceID: "",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 0 {
		t.Errorf("calls = %d, want 0", calls)
	}
}

func TestProcessEventLeavesStateUnchangedOnNotFound(t *testing.T) {
	client := newClient(testConfig(), func(*http.Request) (*http.Response, error) {
		return jsonResponse(404, `{"message":"not found"}`, nil), nil
	})
	store := webhooks.NewStore()

	if err := webhooks.ProcessEvent(client, store, webhooks.Event{
		ID: "evt_4", Family: webhooks.FamilyTransfer, EventType: "payout.transferred", ResourceID: "tr_x",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := store.ResourceState("tr_x"); ok {
		t.Error("state for tr_x should be unset")
	}
}
