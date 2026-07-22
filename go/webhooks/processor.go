package webhooks

import (
	"fmt"

	"github.com/PagouAi/examples/go/internal/pagou"
)

var resourcePath = map[Family]string{
	FamilyTransaction:  "/v2/transactions",
	FamilySubscription: "/v2/subscriptions",
	FamilyTransfer:     "/v2/transfers",
}

// ProcessEvent is the offloaded, slow half of webhook handling. It runs AFTER
// the fast 2xx ack. Business state changes only on a confirmed event, and only
// after reconciling against the API — the webhook body is a hint, the API is the
// source of truth.
func ProcessEvent(client *pagou.Client, store *Store, event Event) error {
	if !IsConfirmedStateChange(event.EventType) {
		pagou.Log().Info(fmt.Sprintf("Ignoring non-confirming event %s (%s)", event.EventType, event.ID), nil)
		return nil
	}
	if event.ResourceID == "" {
		pagou.Log().Warn(fmt.Sprintf("Confirmed event %s without a resource id — cannot reconcile.", event.EventType), nil)
		return nil
	}

	res, err := pagou.RequestData[struct {
		Status string `json:"status"`
	}](client, pagou.RequestParams{
		Method: "GET",
		Path:   fmt.Sprintf("%s/%s", resourcePath[event.Family], event.ResourceID),
	})
	if err != nil {
		if pagou.IsNotFound(err) {
			pagou.Log().Warn(fmt.Sprintf("Resource %s not found during reconciliation.", event.ResourceID), nil)
			return nil
		}
		// Reconciliation failed after the ack: a real system would requeue this
		// event for a later retry rather than replaying side effects.
		pagou.Log().Error(fmt.Sprintf("Reconciliation failed for %s", event.ID), map[string]any{"message": err.Error()})
		return err
	}

	store.SetResourceState(event.ResourceID, res.Data.Status)
	pagou.Log().Info(fmt.Sprintf("Reconciled %s %s → %s", event.Family, event.ResourceID, res.Data.Status), nil)
	return nil
}
