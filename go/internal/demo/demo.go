// Package demo holds synthetic sample data shared by the runnable examples.
// It is safe to commit: never use real documents or PII here.
package demo

import (
	"fmt"
	"os"

	"github.com/PagouAi/examples/go/internal/pagou"
)

// Buyer is a synthetic buyer used across the payment examples.
var Buyer = pagou.Buyer{
	Name:     "Ana Souza",
	Email:    "ana.souza@example.com",
	Document: &pagou.Document{Type: "CPF", Number: "19100000000"},
}

// Products is a synthetic single-item cart.
var Products = []pagou.ProductInput{{Name: "Pro Plan", Price: 4900, Quantity: 1}}

// ResourceIDFromArgs reads a resource id from the first CLI argument or an env
// var, exiting with a helpful message when neither is set.
func ResourceIDFromArgs(envVar string) string {
	if len(os.Args) > 1 && os.Args[1] != "" {
		return os.Args[1]
	}
	if id := os.Getenv(envVar); id != "" {
		return id
	}
	fmt.Fprintf(os.Stderr, "Pass a resource id as the first argument or set %s.\n", envVar)
	os.Exit(1)
	return ""
}
