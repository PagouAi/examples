// Command sandbox-advance is a sandbox-only helper: it forces a transaction to a
// target status so you can exercise the paid/refunded paths without a real
// payer. Never available in production.
// Run: go run ./payments/sandbox-advance <transaction_id> [status=paid]
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
	status := "paid"
	if len(os.Args) > 2 && os.Args[2] != "" {
		status = os.Args[2]
	}
	client := pagou.New(pagou.MustLoadConfig())

	type wrapper struct {
		Transaction struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"transaction"`
	}

	res, err := pagou.RequestData[wrapper](client, pagou.RequestParams{
		Method: "PUT",
		Path:   fmt.Sprintf("/v2/transactions/%s", id),
		Body:   map[string]any{"status": status},
	})
	if err != nil {
		return err
	}

	pagou.PrintResult("Sandbox transaction updated", res.Data.Transaction)
	return nil
}
