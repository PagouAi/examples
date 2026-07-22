// Command card-element is the minimal server for the browser card flow. It
// serves the Payment Element page (injecting only the publishable key) and
// exposes POST /api/pay, which turns the browser's pgct_ token into a real
// charge via POST /v2/transactions.
// Run: go run ./payments/card-element  then open http://localhost:3000
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/PagouAi/examples/go/internal/demo"
	"github.com/PagouAi/examples/go/internal/pagou"
)

//go:embed index.html
var indexHTML string

var tokenRe = regexp.MustCompile(`^pg(ct|pm)_`)

func main() {
	cfg := pagou.MustLoadConfig()
	client := pagou.New(cfg)
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	page := strings.Replace(indexHTML, "__PUBLISHABLE_KEY__", publishableKey(cfg), 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && (r.URL.Path == "/" || r.URL.Path == "/index.html") {
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprint(w, page)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/api/pay", func(w http.ResponseWriter, r *http.Request) {
		handlePay(w, r, client)
	})

	pagou.Log().Info(fmt.Sprintf("Card demo on http://localhost:%s", port), nil)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func publishableKey(cfg pagou.Config) string {
	if cfg.PublishableKey != "" {
		return cfg.PublishableKey
	}
	return "pk_test_set_PAGOU_PUBLISHABLE_KEY"
}

func handlePay(w http.ResponseWriter, r *http.Request, client *pagou.Client) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}

	var payload struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || !tokenRe.MatchString(payload.Token) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "A pgct_/pgpm_ token is required."})
		return
	}

	input := pagou.CreateTransactionInput{
		Amount:       4900,
		Method:       pagou.MethodCreditCard,
		Currency:     "BRL",
		Token:        payload.Token,
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
		pagou.Log().Error("Charge failed", map[string]any{"message": err.Error()})
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "Unexpected error"})
		return
	}

	// Return id/status/next_action so the browser SDK can continue 3DS.
	// Do NOT fulfill here — wait for the confirmed webhook.
	tx := res.Data
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{"id": tx.ID, "status": tx.Status, "next_action": tx.NextAction},
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
