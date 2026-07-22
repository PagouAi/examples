// Command pix creates a Pix charge and returns the copy-and-paste QR payload.
// Run: go run ./payments/pix
package main

import (
	"fmt"
	"os"
	"time"

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
	client := pagou.New(pagou.MustLoadConfig())

	input := pagou.CreateTransactionInput{
		Amount:   4900,
		Method:   pagou.MethodPix,
		Currency: "BRL",
		Buyer:    demo.Buyer,
		Products: demo.Products,
		// external_ref doubles as a natural idempotency key: a duplicate value is
		// rejected with 409 DUPLICATE_EXTERNAL_REF instead of double-charging.
		ExternalRef: fmt.Sprintf("order_%d", time.Now().UnixMilli()),
	}

	res, err := pagou.RequestData[pagou.Transaction](client, pagou.RequestParams{
		Method: "POST",
		Path:   "/v2/transactions",
		Body:   input,
	})
	if err != nil {
		if pagou.IsConflict(err) {
			fmt.Fprintln(os.Stderr, "Duplicate external_ref — this charge was already created.")
			return nil
		}
		return err
	}

	tx := res.Data
	fmt.Printf("Created %s — %s — %s\n", tx.ID, tx.Status, pagou.FormatAmount(tx.Amount, string(tx.Currency)))
	if tx.Pix != nil {
		pagou.PrintResult("Pix QR (copy and paste)", tx.Pix.QRCode)
		pagou.PrintResult("Expires at", tx.Pix.ExpirationDate)
	}
	return nil
}
