// Command create creates a hosted checkout link. The v2 contract exposes only
// POST — the returned public identifier is the checkout URL itself (data.url);
// persist it to share with the buyer. There is no retrieve/list endpoint.
// Run: go run ./checkout-links/create
package main

import (
	"fmt"
	"os"

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

	input := pagou.CreateCheckoutLinkInput{
		Title:    "Pro Plan",
		Currency: "BRL",
		Products: []pagou.CheckoutLinkProduct{
			{ExternalID: "pro-plan", Name: "Pro Plan", Price: 4900, Quantity: 1, Type: "digital"},
		},
	}

	res, err := pagou.RequestData[struct {
		URL string `json:"url"`
	}](client, pagou.RequestParams{
		Method: "POST",
		Path:   "/v2/checkout-links",
		Body:   input,
	})
	if err != nil {
		return err
	}

	// Persist the URL — it is the only handle to the link.
	pagou.PrintResult("Checkout link (store this URL)", res.Data.URL)
	return nil
}
