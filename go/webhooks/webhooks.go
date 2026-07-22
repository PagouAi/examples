// Package webhooks parses and processes the three current webhook envelope
// families. The public contract exposes no signature header, so authenticity is
// established downstream by reconciling against the API — never by trusting
// these bodies. Every family carries a top-level id that is THE dedupe key (a
// resource emits many events over time, so deduping by resource id would drop
// distinct events).
package webhooks

// Family identifies which envelope shape produced an event.
type Family string

const (
	FamilyTransaction  Family = "transaction"
	FamilySubscription Family = "subscription"
	FamilyTransfer     Family = "transfer"
)

// Event is the normalized form of a parsed webhook body.
type Event struct {
	// ID is the top-level event id — the idempotency/dedupe key.
	ID     string
	Family Family
	// EventType is the concrete event name, e.g. transaction.paid or payout.transferred.
	EventType string
	// ResourceID is the public id of the affected resource, used to reconcile.
	ResourceID string
	Raw        any
}

// ParseError is the typed failure returned instead of panicking, so the server
// can answer with the documented error body.
type ParseError string

const (
	ErrMissingEventID  ParseError = "missing_event_id"
	ErrUnknownEnvelope ParseError = "unknown_envelope"
)

func asRecord(value any) (map[string]any, bool) {
	m, ok := value.(map[string]any)
	return m, ok
}

func str(value any) string {
	s, _ := value.(string)
	return s
}

// ParseWebhook routes a raw webhook body to one of the three families and
// extracts the dedupe id, event type and resource id. It returns a non-empty
// ParseError instead of an event when the body cannot be routed.
func ParseWebhook(body any) (Event, ParseError) {
	envelope, ok := asRecord(body)
	if !ok {
		return Event{}, ErrUnknownEnvelope
	}

	id := str(envelope["id"])
	if id == "" {
		return Event{}, ErrMissingEventID
	}

	// Transactions: envelope event = "transaction", name in data.event_type.
	if envelope["event"] == "transaction" {
		data, _ := asRecord(envelope["data"])
		return Event{
			ID:         id,
			Family:     FamilyTransaction,
			EventType:  eventTypeOr(data, "transaction.unknown"),
			ResourceID: str(data["id"]),
			Raw:        body,
		}, ""
	}

	// Subscriptions: envelope event = "subscription", name in data.event_type.
	if envelope["event"] == "subscription" {
		data, _ := asRecord(envelope["data"])
		return Event{
			ID:         id,
			Family:     FamilySubscription,
			EventType:  eventTypeOr(data, "subscription.unknown"),
			ResourceID: str(data["id"]),
			Raw:        body,
		}, ""
	}

	// Transfers: top-level type, resource in data.object.
	if typ := str(envelope["type"]); typ != "" {
		data, _ := asRecord(envelope["data"])
		object, _ := asRecord(data["object"])
		return Event{
			ID:         id,
			Family:     FamilyTransfer,
			EventType:  typ,
			ResourceID: str(object["id"]),
			Raw:        body,
		}, ""
	}

	return Event{}, ErrUnknownEnvelope
}

func eventTypeOr(data map[string]any, fallback string) string {
	if s := str(data["event_type"]); s != "" {
		return s
	}
	return fallback
}

// confirmedEvents are the event types that assert a confirmed, fulfillable
// state change.
var confirmedEvents = map[string]struct{}{
	"transaction.paid":               {},
	"transaction.refunded":           {},
	"transaction.partially_refunded": {},
	"transaction.chargedback":        {},
	"subscription.renewed":           {},
	"subscription.payment_failed":    {},
	"subscription.past_due":          {},
	"subscription.canceled":          {},
	"payout.transferred":             {},
	"payout.failed":                  {},
	"payout.rejected":                {},
	"payout.canceled":                {},
}

// IsConfirmedStateChange reports whether an event should trigger reconciliation
// and a business-state change.
func IsConfirmedStateChange(eventType string) bool {
	_, ok := confirmedEvents[eventType]
	return ok
}
