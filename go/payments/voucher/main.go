// Command voucher creates a voucher (boleto) charge. The printable instructions
// arrive asynchronously: the create response may return status "pending" with
// the voucher block populated once the instrument is issued. Reconcile with a
// GET or a webhook to obtain the final barcode / digitable line / PDF URL.
// Run: go run ./payments/voucher
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
		Amount:      4900,
		Method:      pagou.MethodVoucher,
		Currency:    "BRL",
		Buyer:       demo.Buyer,
		Products:    demo.Products,
		ExternalRef: fmt.Sprintf("voucher_%d", time.Now().UnixMilli()),
	}

	res, err := pagou.RequestData[pagou.Transaction](client, pagou.RequestParams{
		Method: "POST",
		Path:   "/v2/transactions",
		Body:   input,
	})
	if err != nil {
		return err
	}

	tx := res.Data
	fmt.Printf("Created %s — %s — %s\n", tx.ID, tx.Status, pagou.FormatAmount(tx.Amount, string(tx.Currency)))
	if tx.Voucher != nil && (tx.Voucher.Barcode != nil || tx.Voucher.URL != nil) {
		pagou.PrintResult("Voucher instructions", tx.Voucher)
	} else {
		fmt.Printf("Instructions not ready yet — reconcile %s via GET or wait for the webhook.\n", tx.ID)
	}
	return nil
}
