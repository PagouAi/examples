package pagou

import (
	"encoding/json"
	"log"
	"regexp"
	"strings"
)

var sensitiveKeys = map[string]struct{}{
	"authorization": {}, "apikey": {}, "api_key": {}, "token": {},
	"access_token": {}, "client_secret": {}, "secret": {}, "password": {},
	"cvv": {}, "cvc": {}, "pan": {}, "card_number": {}, "number": {},
}

var tokenPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._-]+`),
	regexp.MustCompile(`\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+`),
}

const redacted = "[REDACTED]"

func redactString(value string) string {
	for _, pattern := range tokenPatterns {
		value = pattern.ReplaceAllString(value, redacted)
	}
	return value
}

// Redact deep-clones a value with sensitive fields masked. It runs before
// anything is logged so secrets, tokens and card data never reach a log sink.
func Redact(value any) any {
	switch v := value.(type) {
	case string:
		return redactString(v)
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			if _, sensitive := sensitiveKeys[strings.ToLower(key)]; sensitive {
				out[key] = redacted
			} else {
				out[key] = Redact(item)
			}
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = Redact(item)
		}
		return out
	default:
		return value
	}
}

// Logger emits structured lines with sensitive context redacted. Fields is an
// optional map appended as redacted JSON.
type Logger struct{}

var defaultLogger = Logger{}

func (Logger) emit(level, message string, fields map[string]any) {
	if len(fields) > 0 {
		encoded, _ := json.Marshal(Redact(fields))
		log.Printf("[%s] %s %s", level, message, encoded)
		return
	}
	log.Printf("[%s] %s", level, message)
}

// Info logs an informational line.
func (l Logger) Info(message string, fields map[string]any) { l.emit("INFO", message, fields) }

// Warn logs a warning line.
func (l Logger) Warn(message string, fields map[string]any) { l.emit("WARN", message, fields) }

// Error logs an error line.
func (l Logger) Error(message string, fields map[string]any) { l.emit("ERROR", message, fields) }

// Log returns the shared package logger.
func Log() Logger { return defaultLogger }
