// Command retrieve fetches a transaction by its public UUID.
// Run: go run ./payments/retrieve <transaction_id>
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

	res, err := pagou.RequestData[pagou.Transaction](client, pagou.RequestParams{
		Method: "GET",
		Path:   fmt.Sprintf("/v2/transactions/%s", id),
	})
	if err != nil {
		if pagou.IsNotFound(err) {
			fmt.Fprintf(os.Stderr, "No transaction %s.\n", id)
			return nil
		}
		return err
	}

	tx := res.Data
	pagou.PrintResult("Transaction", map[string]any{
		"id":              tx.ID,
		"status":          tx.Status,
		"amount":          tx.Amount,
		"paid_amount":     tx.PaidAmount,
		"refunded_amount": tx.RefundedAmount,
		"paid_at":         tx.PaidAt,
	})
	return nil
}
