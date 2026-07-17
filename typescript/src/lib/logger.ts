const SENSITIVE_KEYS = new Set([
  "authorization",
  "apikey",
  "api_key",
  "token",
  "access_token",
  "client_secret",
  "secret",
  "password",
  "cvv",
  "cvc",
  "pan",
  "card_number",
  "number",
]);

const TOKEN_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /\bpg(ct|pm|sk|pk)_[A-Za-z0-9]+/g,
];

const REDACTED = "[REDACTED]";

function redactString(value: string): string {
  let out = value;
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * Deep-clones a value with sensitive fields masked. Used before anything is
 * logged so secrets, tokens and card data never reach stdout or a log sink.
 */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(item, seen);
  }
  return out;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function emit(stream: "log" | "warn" | "error", message: string, context?: Record<string, unknown>): void {
  const line = context ? `${message} ${JSON.stringify(redact(context))}` : message;
  console[stream](line);
}

export const logger: Logger = {
  info: (message, context) => emit("log", message, context),
  warn: (message, context) => emit("warn", message, context),
  error: (message, context) => emit("error", message, context),
};
