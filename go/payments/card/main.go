// Command card is the backend half of the card flow. The pgct_ token is produced
// in the browser by the Payment Element (see ../card-element) and posted to your
// server; it is the ONLY card credential your backend ever sees — never a PAN or
// CVV.
// Run: PAGOU_CARD_TOKEN=pgct_... go run ./payments/card  (or pass the token as arg 1)
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
	token := ""
	if len(os.Args) > 1 {
		token = os.Args[1]
	}
	if token == "" {
		token = os.Getenv("PAGOU_CARD_TOKEN")
	}
	if token == "" {
		return fmt.Errorf("provide a pgct_ token from the Payment Element (arg 1 or PAGOU_CARD_TOKEN); start the browser demo with: go run ./payments/card-element")
	}

	client := pagou.New(pagou.MustLoadConfig())
	input := pagou.CreateTransactionInput{
		Amount:       4900,
		Method:       pagou.MethodCreditCard,
		Currency:     "BRL",
		Token:        token,
		Installments: 1,
		Buyer:        demo.Buyer,
		Products:     demo.Products,
		ExternalRef:  fmt.Sprintf("card_%d", time.Now().UnixMilli()),
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

	if tx.Status == "three_ds_required" && tx.NextAction != nil {
		// 3DS: return next_action to the browser so the Payment Element can open
		// the challenge. Do NOT fulfill here — wait for the confirmed webhook.
		pagou.PrintResult("next_action (return to the browser to continue 3DS)", tx.NextAction)
		return nil
	}

	fmt.Println("No 3DS challenge required. Confirm the final state via webhook or reconciliation.")
	return nil
}
