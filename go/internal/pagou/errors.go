package pagou

import (
	"errors"
	"fmt"
)

// ErrorKind classifies an API error so callers can branch on it with errors.As.
type ErrorKind string

const (
	KindAuthentication ErrorKind = "authentication"  // 401
	KindPermission     ErrorKind = "permission"      // 403
	KindInvalidRequest ErrorKind = "invalid_request" // 400/422 and other 4xx
	KindNotFound       ErrorKind = "not_found"       // 404
	KindConflict       ErrorKind = "conflict"        // 409 (e.g. duplicate external_ref)
	KindRateLimit      ErrorKind = "rate_limit"      // 429
	KindServer         ErrorKind = "server"          // 5xx
	KindNetwork        ErrorKind = "network"         // transport failure / timeout
)

// APIError is the single error type surfaced by the raw HTTP reference client.
// Its Kind mirrors the typed error classes in the other language examples.
type APIError struct {
	Kind      ErrorKind
	Status    int
	Code      string
	RequestID string
	Message   string
	Details   any
	Raw       any
	Err       error // underlying transport cause, if any
}

func (e *APIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("%s (%s): %s", e.Kind, e.Code, e.Message)
	}
	return fmt.Sprintf("%s: %s", e.Kind, e.Message)
}

func (e *APIError) Unwrap() error { return e.Err }

// IsKind reports whether err is an *APIError with the given kind.
func IsKind(err error, kind ErrorKind) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Kind == kind
}

// IsNotFound is a convenience predicate for 404 responses.
func IsNotFound(err error) bool { return IsKind(err, KindNotFound) }

// IsConflict is a convenience predicate for 409 responses.
func IsConflict(err error) bool { return IsKind(err, KindConflict) }

// IsInvalidRequest is a convenience predicate for validation failures.
func IsInvalidRequest(err error) bool { return IsKind(err, KindInvalidRequest) }

type parsedError struct {
	message   string
	code      string
	requestID string
	details   any
}

// parseErrorBody normalizes the two documented error shapes: the simple
// { error, message, status } body and RFC 7807 problem+json ({ title, detail,
// errors[] }).
func parseErrorBody(body any, fallbackRequestID string) parsedError {
	obj, ok := body.(map[string]any)
	if !ok {
		return parsedError{message: "Request failed", requestID: fallbackRequestID}
	}

	message := firstString(obj, "message", "detail", "title", "error")
	if message == "" {
		message = "Request failed"
	}
	code, _ := obj["code"].(string)
	if code == "" {
		code, _ = obj["error"].(string)
	}
	requestID := firstString(obj, "requestId", "request_id")
	if requestID == "" {
		requestID = fallbackRequestID
	}
	var details any
	if v, ok := obj["errors"]; ok {
		details = v
	} else if v, ok := obj["details"]; ok {
		details = v
	}
	return parsedError{message: message, code: code, requestID: requestID, details: details}
}

func firstString(obj map[string]any, keys ...string) string {
	for _, key := range keys {
		if s, ok := obj[key].(string); ok && s != "" {
			return s
		}
	}
	return ""
}

// toAPIError maps an HTTP status and response body to a typed APIError.
func toAPIError(status int, body any, requestIDFromHeader string) *APIError {
	parsed := parseErrorBody(body, requestIDFromHeader)
	err := &APIError{
		Status:    status,
		Code:      parsed.code,
		RequestID: parsed.requestID,
		Message:   parsed.message,
		Details:   parsed.details,
		Raw:       body,
	}
	switch {
	case status == 401:
		err.Kind = KindAuthentication
	case status == 403:
		err.Kind = KindPermission
	case status == 404:
		err.Kind = KindNotFound
	case status == 409:
		err.Kind = KindConflict
	case status == 429:
		err.Kind = KindRateLimit
	case status >= 500:
		err.Kind = KindServer
	default:
		err.Kind = KindInvalidRequest
	}
	return err
}

func networkError(message, requestID string, cause error) *APIError {
	return &APIError{Kind: KindNetwork, Message: message, RequestID: requestID, Err: cause}
}
