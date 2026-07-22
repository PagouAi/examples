package pagou

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
)

// FormatAmount renders an integer amount in the smallest currency unit as a
// display string (e.g. 4900 -> "BRL 49.00").
func FormatAmount(cents int, currency string) string {
	if currency == "" {
		currency = "BRL"
	}
	return fmt.Sprintf("%s %.2f", currency, float64(cents)/100)
}

// IdempotencyKey builds a short, stable key for a given operation and reference.
func IdempotencyKey(operation, reference string) string {
	return operation + "_" + reference
}

// PrintResult prints a labelled JSON block for readable script output.
func PrintResult(label string, value any) {
	encoded, _ := json.MarshalIndent(value, "", "  ")
	fmt.Printf("\n%s:\n%s\n", label, encoded)
}

// newUUID returns a RFC 4122 version 4 UUID string using crypto/rand, keeping
// the client dependency-free.
func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "00000000-0000-4000-8000-000000000000"
	}
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
