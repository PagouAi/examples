package pagou

import "fmt"

// FulfillmentDecision is the business outcome of reconciling a transaction.
type FulfillmentDecision string

const (
	Fulfill FulfillmentDecision = "fulfill"
	Wait    FulfillmentDecision = "wait"
	Cancel  FulfillmentDecision = "cancel"
)

// terminalFailed are the terminal failure/cancel states: stop waiting, release
// the order.
var terminalFailed = map[TransactionStatus]struct{}{
	"canceled": {}, "expired": {}, "refused": {},
}

// DecideFulfillment maps a transaction status to a business decision. It never
// fulfills on a pending state.
func DecideFulfillment(status TransactionStatus) FulfillmentDecision {
	if _, ok := terminalPaidStatuses[status]; ok {
		return Fulfill
	}
	if _, ok := terminalFailed[status]; ok {
		return Cancel
	}
	return Wait
}

// Reconciliation is the outcome of a server-side reconcile.
type Reconciliation struct {
	Transaction Transaction
	Decision    FulfillmentDecision
}

// ReconcileTransaction fetches the transaction from the API (the source of
// truth) and decides whether to fulfill. Business state changes only on this
// confirmed result, never on an unverified webhook body. A missing transaction
// returns (nil, nil).
func ReconcileTransaction(client *Client, id string) (*Reconciliation, error) {
	res, err := RequestData[Transaction](client, RequestParams{
		Method: "GET",
		Path:   fmt.Sprintf("/v2/transactions/%s", id),
	})
	if err != nil {
		if IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	return &Reconciliation{Transaction: res.Data, Decision: DecideFulfillment(res.Data.Status)}, nil
}
