// Command list lists transactions with cursor pagination. Filters use camelCase
// query names (paymentMethods), while the envelope cursors are snake_case
// (next_cursor / prev_cursor). Walks up to three pages forward.
// Run: go run ./payments/list
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
	var cursor string

	for pageNum := 1; pageNum <= 3; pageNum++ {
		query := map[string]any{"limit": 5, "paymentMethods": []string{"pix", "credit_card"}}
		if cursor != "" {
			query["cursor"] = cursor
			query["direction"] = "next"
		}

		res, err := pagou.RequestCursorPage[pagou.TransactionListItem](client, pagou.RequestParams{
			Method: "GET",
			Path:   "/v2/transactions",
			Query:  query,
		})
		if err != nil {
			return err
		}
		page := res.Data

		fmt.Printf("\nPage %d — %d of %d total\n", pageNum, len(page.Data), page.Total)
		for _, item := range page.Data {
			fmt.Printf("  %s  %-18s  %s  %d\n", item.ID, item.Status, item.Payment.Method, item.Payment.Amount)
		}

		if page.NextCursor == nil {
			fmt.Println("\nNo more pages.")
			break
		}
		cursor = *page.NextCursor
	}
	return nil
}
