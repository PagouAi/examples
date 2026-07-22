package tests

import (
	"io"
	"net/http"
	"strings"

	"github.com/PagouAi/examples/go/internal/pagou"
)

// roundTripFunc adapts a function to an http.RoundTripper so tests can return
// canned responses without a live server.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func testConfig() pagou.Config {
	return pagou.Config{
		Environment: pagou.Sandbox,
		BaseURL:     "https://api.sandbox.pagou.ai",
		APIToken:    "test_token",
		TimeoutMs:   1000,
		MaxRetries:  1,
	}
}

func newClient(cfg pagou.Config, rt roundTripFunc) *pagou.Client {
	return pagou.NewWithHTTPClient(cfg, &http.Client{Transport: rt})
}

func jsonResponse(status int, body string, headers map[string]string) *http.Response {
	h := http.Header{"Content-Type": {"application/json"}}
	for k, v := range headers {
		h.Set(k, v)
	}
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     h,
	}
}
