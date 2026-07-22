// Command lifecycle runs the end-to-end subscription lifecycle:
//
//	create/reuse customer → create subscription → retrieve → cancel.
//
// Renewal / failure / past-due / cancellation are delivered as webhooks (see
// ../../webhooks); business state changes only on those confirmed events.
// Run: PAGOU_CARD_TOKEN=pgct_... go run ./subscriptions/lifecycle
package main

import (
	"fmt"
	"os"

	"github.com/PagouAi/examples/go/internal/pagou"
	"github.com/PagouAi/examples/go/subscriptions"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	token := os.Getenv("PAGOU_CARD_TOKEN")
	if token == "" {
		return fmt.Errorf("set PAGOU_CARD_TOKEN to a pgct_ token from the Payment Element (subscription mode)")
	}

	client := pagou.New(pagou.MustLoadConfig())

	customer, err := subscriptions.CreateOrReuseCustomer(client)
	if err != nil {
		return err
	}
	fmt.Printf("Customer %s (%s)\n", customer.ID, customer.Email)

	input := pagou.CreateSubscriptionInput{
		CustomerID:      customer.ID,
		PaymentMethod:   "credit_card",
		Token:           token,
		Interval:        "month",
		IntervalCount:   1,
		Amount:          4900,
		Currency:        "BRL",
		FailurePolicy:   "retry_then_cancel",
		RetryOffsetDays: []int{1, 3, 7},
		Products:        []pagou.ProductInput{{Name: "Pro Plan", Price: 4900}},
	}

	created, err := pagou.RequestData[pagou.Subscription](client, pagou.RequestParams{
		Method: "POST",
		Path:   "/v2/subscriptions",
		Body:   input,
		// Idempotent create: a retry reuses the same subscription instead of a duplicate.
		IdempotencyKey: pagou.IdempotencyKey("sub_create", customer.ID),
	})
	if err != nil {
		return err
	}
	sub := created.Data
	fmt.Printf("Subscription %s — %s — %s/month\n", sub.ID, sub.Status, pagou.FormatAmount(sub.Amount, string(sub.Currency)))

	fetched, err := pagou.RequestData[pagou.Subscription](client, pagou.RequestParams{
		Method: "GET",
		Path:   fmt.Sprintf("/v2/subscriptions/%s", sub.ID),
	})
	if err != nil {
		return err
	}
	pagou.PrintResult("Billed transactions", fetched.Data.Transactions)

	canceled, err := pagou.RequestData[pagou.Subscription](client, pagou.RequestParams{
		Method: "POST",
		Path:   fmt.Sprintf("/v2/subscriptions/%s/cancel", sub.ID),
		Body:   map[string]any{"reason": "user_requested"},
	})
	if err != nil {
		return err
	}
	c := canceled.Data
	fmt.Printf("Canceled %s: cancelAtPeriodEnd=%t, canceledAt=%v\n", c.ID, c.CancelAtPeriodEnd, deref(c.CanceledAt))
	return nil
}

func deref(s *string) string {
	if s == nil {
		return "null"
	}
	return *s
}
