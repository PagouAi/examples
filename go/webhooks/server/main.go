// Command server is the webhook receiver for the three event families. It
// follows the rules every handler must: parse the envelope, require the event
// id, dedupe redeliveries, answer 2xx immediately, and offload the slow
// reconciliation. Business state is updated only inside the offloaded processor,
// only on confirmed events.
// Run: go run ./webhooks/server   (POST envelopes to http://localhost:4000/webhooks/pagou)
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/PagouAi/examples/go/internal/pagou"
	"github.com/PagouAi/examples/go/webhooks"
)

func main() {
	client := pagou.New(pagou.MustLoadConfig())
	store := webhooks.NewStore()
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/webhooks/pagou", func(w http.ResponseWriter, r *http.Request) {
		handle(w, r, client, store)
	})

	pagou.Log().Info(fmt.Sprintf("Webhook receiver on http://localhost:%s/webhooks/pagou", port), nil)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func handle(w http.ResponseWriter, r *http.Request, client *pagou.Client, store *webhooks.Store) {
	if r.Method != http.MethodPost {
		reply(w, http.StatusNotFound, map[string]any{"error": "not_found"})
		return
	}

	var body any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		reply(w, http.StatusBadRequest, map[string]any{"error": "invalid_json"})
		return
	}

	event, parseErr := webhooks.ParseWebhook(body)
	if parseErr != "" {
		// Documented ingestion error for a missing event id.
		status := http.StatusUnprocessableEntity
		if parseErr == webhooks.ErrMissingEventID {
			status = http.StatusBadRequest
		}
		reply(w, status, map[string]any{"error": string(parseErr)})
		return
	}

	// Dedupe synchronously: a redelivery is acknowledged without reprocessing.
	if !store.MarkProcessed(event.ID) {
		pagou.Log().Info(fmt.Sprintf("Duplicate delivery ignored: %s (%s)", event.ID, event.EventType), nil)
		reply(w, http.StatusOK, map[string]any{"received": true})
		return
	}

	// Ack fast (fulfilling the "respond 2xx quickly" rule), then offload the
	// reconciliation so a slow API call never delays the response or risks a retry.
	reply(w, http.StatusOK, map[string]any{"received": true})
	go func() {
		if err := webhooks.ProcessEvent(client, store, event); err != nil {
			pagou.Log().Error(fmt.Sprintf("Deferred processing failed for %s", event.ID), map[string]any{"message": err.Error()})
		}
	}()
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
