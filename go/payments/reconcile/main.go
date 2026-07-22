// Command reconcile reconciles a transaction against the API and prints the
// fulfillment decision. This is the safe pattern behind every webhook: trust the
// API, not the event.
// Run: go run ./payments/reconcile <transaction_id>
package main

import (
	"fmt"
	"os"

	"github.com/PagouAi/examples/go/internal/demo"
	"github.com/PagouAi/examples/go/internal/pagou"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	id := demo.ResourceIDFromArgs("PAGOU_TRANSACTION_ID")
	client := pagou.New(pagou.MustLoadConfig())

	result, err := pagou.ReconcileTransaction(client, id)
	if err != nil {
		return err
	}
	if result == nil {
		fmt.Fprintf(os.Stderr, "No transaction %s.\n", id)
		return nil
	}

	fmt.Printf("Transaction %s is %s → decision: %s\n", result.Transaction.ID, result.Transaction.Status, result.Decision)
	switch result.Decision {
	case pagou.Fulfill:
		fmt.Println("Safe to deliver: the charge is settled.")
	case pagou.Wait:
		fmt.Println("Not settled yet: keep the order pending and reconcile again later.")
	default:
		fmt.Println("Failed/expired: release the order.")
	}
	return nil
}
