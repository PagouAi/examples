// Command refund refunds a transaction. Omit the amount for a full refund; pass
// cents for a partial one. The refund is idempotent via an Idempotency-Key so a
// retry after a network blip never double-refunds.
// Run: go run ./payments/refund <transaction_id> [amount_cents]
package main

import (
	"fmt"
	"os"
	"strconv"

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

	var body map[string]any
	amountLabel := "full"
	if len(os.Args) > 2 && os.Args[2] != "" {
		amount, err := strconv.Atoi(os.Args[2])
		if err != nil {
			return fmt.Errorf("amount must be an integer number of cents: %w", err)
		}
		body = map[string]any{"amount": amount, "reason": "requested_by_customer"}
		amountLabel = strconv.Itoa(amount)
	} else {
		body = map[string]any{"reason": "requested_by_customer"}
	}

	res, err := pagou.RequestData[pagou.RefundResult](client, pagou.RequestParams{
		Method:         "PUT",
		Path:           fmt.Sprintf("/v2/transactions/%s/refund", id),
		Body:           body,
		IdempotencyKey: pagou.IdempotencyKey("refund", fmt.Sprintf("%s_%s", id, amountLabel)),
	})
	if err != nil {
		if pagou.IsInvalidRequest(err) {
			fmt.Fprintf(os.Stderr, "Refund rejected: %s\n", err)
			return nil
		}
		return err
	}

	refund := res.Data
	if refund.IsFullRefund {
		fmt.Println("Full refund processed.")
	} else {
		fmt.Println("Partial refund processed.")
	}
	pagou.PrintResult("Refund", map[string]any{
		"amount_refunded":   pagou.FormatAmount(refund.AmountRefunded, "BRL"),
		"remaining_balance": pagou.FormatAmount(refund.RemainingBalance, "BRL"),
	})
	return nil
}
