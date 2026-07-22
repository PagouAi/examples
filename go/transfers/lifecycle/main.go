// Command lifecycle runs the Pix Out lifecycle with the raw client:
//
//	create → retrieve/reconcile → cancel.
//
// The final state (paid / rejected) arrives via the transfer webhook family;
// reconcile with GET when you need certainty. Note amount is a numeric cents
// value on input but a decimal string on responses.
// Run: go run ./transfers/lifecycle
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/PagouAi/examples/go/internal/pagou"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	client := pagou.New(pagou.MustLoadConfig())

	input := pagou.CreateTransferInput{
		PixKeyType:  "EMAIL",
		PixKeyValue: "supplier@example.com",
		Amount:      5000, // R$50.00 in cents (minimum is 1000)
		Description: "Supplier payout",
		ExternalRef: fmt.Sprintf("payout_%d", time.Now().UnixMilli()),
	}

	created, err := pagou.RequestData[pagou.Transfer](client, pagou.RequestParams{
		Method:         "POST",
		Path:           "/v2/transfers",
		Body:           input,
		IdempotencyKey: pagou.IdempotencyKey("transfer", input.ExternalRef),
	})
	if err != nil {
		return err
	}
	fmt.Printf("Transfer %s — %s — amount(cents)=%s\n", created.Data.ID, created.Data.Status, created.Data.Amount)

	// Reconcile: re-read the current state before acting on it.
	current, err := pagou.RequestData[pagou.Transfer](client, pagou.RequestParams{
		Method: "GET",
		Path:   fmt.Sprintf("/v2/transfers/%s", created.Data.ID),
	})
	if err != nil {
		return err
	}
	pagou.PrintResult("Current state", map[string]any{
		"id": current.Data.ID, "status": current.Data.Status, "fee": current.Data.Fee,
	})

	if !pagou.IsTransferCancelable(current.Data.Status) {
		fmt.Printf("Status %s is not cancelable; the final state will arrive by webhook.\n", current.Data.Status)
		return nil
	}

	canceled, err := pagou.RequestData[pagou.Transfer](client, pagou.RequestParams{
		Method: "POST",
		Path:   fmt.Sprintf("/v2/transfers/%s/cancel", created.Data.ID),
		Body:   map[string]any{"reason": "wrong recipient"},
	})
	if err != nil {
		if pagou.IsConflict(err) {
			fmt.Fprintln(os.Stderr, "Already progressed past a cancelable state — reconcile via webhook/GET.")
			return nil
		}
		return err
	}
	fmt.Printf("Canceled %s — %s\n", canceled.Data.ID, canceled.Data.Status)
	return nil
}
