import { config as loadDotenv } from "dotenv";

loadDotenv();

export type Environment = "sandbox" | "production";

const SANDBOX_BASE_URL = "https://api.sandbox.pagou.ai";
const PRODUCTION_BASE_URL = "https://api.pagou.ai";

export interface PagouConfig {
  environment: Environment;
  baseUrl: string;
  apiToken: string;
  webhookUrl?: string;
  publishableKey?: string;
  timeoutMs: number;
  maxRetries: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and set it.`,
    );
  }
  return value;
}

function resolveEnvironment(): Environment {
  const raw = (process.env.PAGOU_ENVIRONMENT ?? "sandbox").toLowerCase();
  if (raw !== "sandbox" && raw !== "production") {
    throw new Error(`PAGOU_ENVIRONMENT must be "sandbox" or "production", got "${raw}".`);
  }
  return raw;
}

function resolveBaseUrl(environment: Environment): string {
  const override = process.env.PAGOU_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  return environment === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

/**
 * Loads and validates configuration from the environment. The API token is a
 * server-side secret and is never exposed to the browser.
 */
export function loadConfig(): PagouConfig {
  const environment = resolveEnvironment();
  return {
    environment,
    baseUrl: resolveBaseUrl(environment),
    apiToken: requireEnv("PAGOU_API_TOKEN"),
    webhookUrl: process.env.PAGOU_WEBHOOK_URL,
    publishableKey: process.env.PAGOU_PUBLISHABLE_KEY,
    timeoutMs: Number(process.env.PAGOU_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(process.env.PAGOU_MAX_RETRIES ?? 2),
  };
}
