package pagou

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	retryableStatus  = map[int]struct{}{429: {}, 500: {}, 502: {}, 503: {}, 504: {}}
	idempotentMethod = map[string]struct{}{http.MethodGet: {}, http.MethodHead: {}}
)

// RequestParams describes a single call to the API.
type RequestParams struct {
	Method string
	Path   string
	Query  map[string]any
	Body   any
	// IdempotencyKey is sent as Idempotency-Key and also makes a write retryable
	// on transient failures.
	IdempotencyKey string
	// RequestID is the correlation id echoed as X-Request-Id. Generated when empty.
	RequestID string
	TimeoutMs int
}

// Result carries a decoded payload plus response metadata.
type Result[T any] struct {
	Data      T
	Status    int
	RequestID string
}

// dataEnvelope is the { success, requestId, data } wrapper every non-list
// endpoint returns.
type dataEnvelope[T any] struct {
	Success   bool   `json:"success"`
	RequestID string `json:"requestId"`
	Data      T      `json:"data"`
}

// CursorPage is the envelope for list endpoints. The cursor fields are
// snake_case on the wire.
type CursorPage[T any] struct {
	Success    bool    `json:"success"`
	RequestID  string  `json:"requestId"`
	Data       []T     `json:"data"`
	NextCursor *string `json:"next_cursor"`
	PrevCursor *string `json:"prev_cursor"`
	Total      int     `json:"total"`
}

// Client is a minimal, dependency-light reference client for the Pagou API v2
// built on net/http. It demonstrates the fundamentals every language example
// must show: server-side auth, correlation ids, idempotency keys, timeouts,
// bounded retries for transient failures on idempotent operations, typed errors
// and redacted logging.
type Client struct {
	config Config
	http   *http.Client
}

// New builds a client from the given config.
func New(cfg Config) *Client {
	return NewWithHTTPClient(cfg, &http.Client{})
}

// NewWithHTTPClient builds a client with a caller-supplied *http.Client. Tests
// inject a client whose Transport returns canned responses.
func NewWithHTTPClient(cfg Config, hc *http.Client) *Client {
	return &Client{config: cfg, http: hc}
}

func (c *Client) authHeader() (string, string) {
	// The API key is a server-side secret; it is never read in browser code.
	return "Authorization", "Bearer " + c.config.APIToken
}

func (c *Client) buildURL(path string, query map[string]any) (string, error) {
	base, err := url.Parse(strings.TrimRight(c.config.BaseURL, "/") + "/")
	if err != nil {
		return "", err
	}
	ref, err := url.Parse(strings.TrimPrefix(path, "/"))
	if err != nil {
		return "", err
	}
	u := base.ResolveReference(ref)
	if len(query) > 0 {
		q := u.Query()
		for key, value := range query {
			if s, ok := queryValue(value); ok {
				q.Set(key, s)
			}
		}
		u.RawQuery = q.Encode()
	}
	return u.String(), nil
}

func queryValue(value any) (string, bool) {
	switch v := value.(type) {
	case nil:
		return "", false
	case string:
		return v, true
	case []string:
		if len(v) == 0 {
			return "", false
		}
		return strings.Join(v, ","), true
	case int:
		return strconv.Itoa(v), true
	case bool:
		return strconv.FormatBool(v), true
	default:
		return fmt.Sprintf("%v", v), true
	}
}

func (c *Client) canRetry(method, idempotencyKey string) bool {
	if _, ok := idempotentMethod[method]; ok {
		return true
	}
	// Writes are retried only when an idempotency key guards against duplicates.
	return (method == http.MethodPost || method == http.MethodPut) && idempotencyKey != ""
}

// rawResult holds a decoded-but-unwrapped response body.
type rawResult struct {
	body      json.RawMessage
	status    int
	requestID string
}

func (c *Client) request(p RequestParams) (*rawResult, error) {
	requestID := p.RequestID
	if requestID == "" {
		requestID = newUUID()
	}
	fullURL, err := c.buildURL(p.Path, p.Query)
	if err != nil {
		return nil, networkError("Invalid request URL", requestID, err)
	}
	retryable := c.canRetry(p.Method, p.IdempotencyKey)
	maxAttempts := 1
	if retryable {
		maxAttempts = c.config.MaxRetries + 1
	}

	Log().Info(fmt.Sprintf("→ %s %s", p.Method, fullURL), map[string]any{
		"requestId": requestID,
		"body":      p.Body,
	})

	timeout := time.Duration(p.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = time.Duration(c.config.TimeoutMs) * time.Millisecond
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		result, retry, err := c.attempt(p, fullURL, requestID, retryable, attempt, maxAttempts, timeout)
		if err != nil {
			lastErr = err
			if retry {
				continue
			}
			return nil, err
		}
		return result, nil
	}
	return nil, networkError("Request failed after retries", requestID, lastErr)
}

func (c *Client) attempt(p RequestParams, fullURL, requestID string, retryable bool, attempt, maxAttempts int, timeout time.Duration) (*rawResult, bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var bodyReader io.Reader
	if p.Body != nil {
		encoded, err := json.Marshal(p.Body)
		if err != nil {
			return nil, false, networkError("Failed to encode request body", requestID, err)
		}
		bodyReader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, p.Method, fullURL, bodyReader)
	if err != nil {
		return nil, false, networkError("Failed to build request", requestID, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Request-Id", requestID)
	req.Header.Set(c.authHeader())
	if p.IdempotencyKey != "" {
		req.Header.Set("Idempotency-Key", p.IdempotencyKey)
	}
	if p.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		isTimeout := errors.Is(err, context.DeadlineExceeded) || ctx.Err() == context.DeadlineExceeded
		if retryable && attempt < maxAttempts-1 {
			sleep(backoff(attempt, ""))
			return nil, true, err
		}
		message := "Network request failed"
		if isTimeout {
			message = "Request timed out"
		}
		return nil, false, networkError(message, requestID, err)
	}
	defer resp.Body.Close()

	responseID := resp.Header.Get("X-Request-Id")
	if responseID == "" {
		responseID = requestID
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		if retryable && attempt < maxAttempts-1 {
			sleep(backoff(attempt, ""))
			return nil, true, err
		}
		return nil, false, networkError("Failed to read response body", requestID, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if _, ok := retryableStatus[resp.StatusCode]; retryable && ok && attempt < maxAttempts-1 {
			sleep(backoff(attempt, resp.Header.Get("Retry-After")))
			return nil, true, fmt.Errorf("retryable status %d", resp.StatusCode)
		}
		apiErr := toAPIError(resp.StatusCode, decodeAny(body), responseID)
		Log().Warn(fmt.Sprintf("← %d %s %s", resp.StatusCode, p.Method, p.Path), map[string]any{
			"requestId": responseID,
			"code":      apiErr.Code,
		})
		return nil, false, apiErr
	}

	Log().Info(fmt.Sprintf("← %d %s %s", resp.StatusCode, p.Method, p.Path), map[string]any{"requestId": responseID})
	return &rawResult{body: json.RawMessage(body), status: resp.StatusCode, requestID: responseID}, false, nil
}

// RequestData unwraps a { success, requestId, data } envelope to its data.
func RequestData[T any](c *Client, p RequestParams) (Result[T], error) {
	raw, err := c.request(p)
	if err != nil {
		return Result[T]{}, err
	}
	var env dataEnvelope[T]
	if err := json.Unmarshal(raw.body, &env); err != nil {
		return Result[T]{}, networkError("Failed to decode response envelope", raw.requestID, err)
	}
	requestID := env.RequestID
	if requestID == "" {
		requestID = raw.requestID
	}
	return Result[T]{Data: env.Data, Status: raw.status, RequestID: requestID}, nil
}

// RequestCursorPage returns a full cursor page (keeps next/prev cursor and total).
func RequestCursorPage[T any](c *Client, p RequestParams) (Result[CursorPage[T]], error) {
	raw, err := c.request(p)
	if err != nil {
		return Result[CursorPage[T]]{}, err
	}
	var page CursorPage[T]
	if err := json.Unmarshal(raw.body, &page); err != nil {
		return Result[CursorPage[T]]{}, networkError("Failed to decode cursor page", raw.requestID, err)
	}
	return Result[CursorPage[T]]{Data: page, Status: raw.status, RequestID: raw.requestID}, nil
}

func decodeAny(body []byte) any {
	if len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	var out any
	if err := json.Unmarshal(body, &out); err != nil {
		return string(body)
	}
	return out
}

func backoff(attempt int, retryAfter string) time.Duration {
	if retryAfter != "" {
		if seconds, err := strconv.ParseFloat(retryAfter, 64); err == nil {
			return time.Duration(math.Min(seconds*1000, 5000)) * time.Millisecond
		}
	}
	base := 200 * math.Pow(2, float64(attempt))
	jitter := math.Floor(deterministicJitter(attempt) * 200)
	return time.Duration(math.Min(base+jitter, 5000)) * time.Millisecond
}

// deterministicJitter keeps the reference reproducible without a random source.
func deterministicJitter(attempt int) float64 {
	x := math.Sin(float64(attempt+1)) * 10_000
	return x - math.Floor(x)
}

func sleep(d time.Duration) { time.Sleep(d) }
