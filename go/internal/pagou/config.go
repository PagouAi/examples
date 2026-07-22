package pagou

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Environment selects the API host set.
type Environment string

const (
	Sandbox    Environment = "sandbox"
	Production Environment = "production"
)

const (
	sandboxBaseURL    = "https://api.sandbox.pagou.ai"
	productionBaseURL = "https://api.pagou.ai"
)

// Config holds the runtime settings loaded from the environment. The API token
// is a server-side secret and is never exposed to the browser.
type Config struct {
	Environment    Environment
	BaseURL        string
	APIToken       string
	WebhookURL     string
	PublishableKey string
	TimeoutMs      int
	MaxRetries     int
}

// LoadConfig reads and validates configuration from the environment, loading a
// local .env file first when present.
func LoadConfig() (Config, error) {
	loadDotEnv(".env")

	env, err := resolveEnvironment()
	if err != nil {
		return Config{}, err
	}
	token := strings.TrimSpace(os.Getenv("PAGOU_API_TOKEN"))
	if token == "" {
		return Config{}, fmt.Errorf("missing required environment variable PAGOU_API_TOKEN; copy .env.example to .env and set it")
	}
	return Config{
		Environment:    env,
		BaseURL:        resolveBaseURL(env),
		APIToken:       token,
		WebhookURL:     os.Getenv("PAGOU_WEBHOOK_URL"),
		PublishableKey: os.Getenv("PAGOU_PUBLISHABLE_KEY"),
		TimeoutMs:      envInt("PAGOU_TIMEOUT_MS", 30_000),
		MaxRetries:     envInt("PAGOU_MAX_RETRIES", 2),
	}, nil
}

// MustLoadConfig loads the config or exits with a helpful message. Runnable
// scripts use it so a missing token fails fast at startup.
func MustLoadConfig() Config {
	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	return cfg
}

func resolveEnvironment() (Environment, error) {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("PAGOU_ENVIRONMENT")))
	switch raw {
	case "", string(Sandbox):
		return Sandbox, nil
	case string(Production):
		return Production, nil
	default:
		return "", fmt.Errorf("PAGOU_ENVIRONMENT must be %q or %q, got %q", Sandbox, Production, raw)
	}
}

func resolveBaseURL(env Environment) string {
	if override := strings.TrimSpace(os.Getenv("PAGOU_BASE_URL")); override != "" {
		return strings.TrimRight(override, "/")
	}
	if env == Production {
		return productionBaseURL
	}
	return sandboxBaseURL
}

func envInt(name string, fallback int) int {
	if raw := strings.TrimSpace(os.Getenv(name)); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			return n
		}
	}
	return fallback
}

// loadDotEnv reads simple KEY=VALUE lines from a .env file without overwriting
// variables already set in the process. Kept dependency-free on purpose.
func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" {
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, value)
			}
		}
	}
}
