import { randomUUID } from "node:crypto";
import { loadConfig, type PagouConfig } from "./config.js";
import { NetworkError, toApiError } from "./errors.js";
import { logger, redact } from "./logger.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestParams {
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  /** Sent as `Idempotency-Key`; also makes a write retryable on transient failures. */
  idempotencyKey?: string;
  /** Correlation id echoed as `X-Request-Id`. Auto-generated when omitted. */
  requestId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface Result<T> {
  data: T;
  status: number;
  requestId?: string;
}

/** Data envelope every non-list endpoint returns. */
interface DataEnvelope<T> {
  success: boolean;
  requestId: string;
  data: T;
}

/** Cursor envelope for list endpoints (`next_cursor`/`prev_cursor` are snake_case). */
export interface CursorPage<T> {
  success: boolean;
  requestId: string;
  data: T[];
  next_cursor: string | null;
  prev_cursor: string | null;
  total: number;
}

/**
 * Minimal, dependency-free reference client for the Pagou API v2 built on the
 * native `fetch` (Node 18+). It demonstrates the fundamentals every language
 * example must show: server-side auth, correlation ids, idempotency keys,
 * timeouts, bounded retries for transient failures on idempotent operations,
 * typed errors and redacted logging.
 */
export class PagouHttpClient {
  private readonly config: PagouConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PagouConfig = loadConfig(), fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private authHeader(): [string, string] {
    // The API key is a server-side secret; it is never read in browser code.
    return ["Authorization", `Bearer ${this.config.apiToken}`];
  }

  private buildUrl(path: string, query?: Record<string, unknown>): URL {
    const url = new URL(path.replace(/^\//, ""), `${this.config.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          if (value.length === 0) continue;
          url.searchParams.set(key, value.map(String).join(","));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url;
  }

  private canRetry(method: HttpMethod, idempotencyKey?: string): boolean {
    if (IDEMPOTENT_METHODS.has(method)) return true;
    // Writes are retried only when an idempotency key guards against duplicates.
    return (method === "POST" || method === "PUT") && Boolean(idempotencyKey);
  }

  async request<T>(params: RequestParams): Promise<Result<T>> {
    const requestId = params.requestId ?? randomUUID();
    const url = this.buildUrl(params.path, params.query);
    const retryable = this.canRetry(params.method, params.idempotencyKey);
    const maxAttempts = retryable ? this.config.maxRetries + 1 : 1;

    logger.info(`→ ${params.method} ${url.pathname}${url.search}`, {
      requestId,
      body: params.body,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? this.config.timeoutMs);
      if (params.signal) {
        if (params.signal.aborted) controller.abort();
        else params.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const headers = new Headers({ Accept: "application/json", "X-Request-Id": requestId });
        headers.set(...this.authHeader());
        if (params.idempotencyKey) headers.set("Idempotency-Key", params.idempotencyKey);
        if (params.body !== undefined) headers.set("Content-Type", "application/json");

        const response = await this.fetchImpl(url, {
          method: params.method,
          headers,
          body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
          signal: controller.signal,
        });
        const responseId = response.headers.get("x-request-id") ?? requestId;
        const payload = await parseBody(response);

        if (!response.ok) {
          if (retryable && RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts - 1) {
            await sleep(backoffMs(attempt, response.headers.get("Retry-After")));
            continue;
          }
          const error = toApiError(response.status, payload, responseId);
          logger.warn(`← ${response.status} ${params.method} ${url.pathname}`, {
            requestId: responseId,
            code: error.code,
          });
          throw error;
        }

        logger.info(`← ${response.status} ${params.method} ${url.pathname}`, { requestId: responseId });
        return { data: payload as T, status: response.status, requestId: responseId };
      } catch (error) {
        lastError = error;
        // A mapped API error (4xx/5xx already resolved above) is terminal here.
        if (error && typeof error === "object" && (error as { status?: number }).status !== undefined) {
          throw error;
        }
        const callerAborted = params.signal?.aborted ?? false;
        const isTimeout = controller.signal.aborted && !callerAborted;
        // Retry transport failures/timeouts on idempotent operations only.
        if (retryable && !callerAborted && attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        throw new NetworkError(isTimeout ? "Request timed out" : "Network request failed", {
          requestId,
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new NetworkError("Request failed after retries", { requestId, cause: lastError });
  }

  /** Unwraps a `{ success, requestId, data }` envelope to its `data`. */
  async requestData<T>(params: RequestParams): Promise<Result<T>> {
    const result = await this.request<DataEnvelope<T>>(params);
    return { data: result.data.data, status: result.status, requestId: result.data.requestId ?? result.requestId };
  }

  /** Returns a full cursor page (keeps `next_cursor`/`prev_cursor`/`total`). */
  async requestCursorPage<T>(params: RequestParams): Promise<Result<CursorPage<T>>> {
    return this.request<CursorPage<T>>(params);
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) return null;
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5000);
  }
  const base = 200 * 2 ** attempt;
  const jitter = Math.floor(deterministicJitter(attempt) * 200);
  return Math.min(base + jitter, 5000);
}

// Small deterministic jitter keeps the reference reproducible without Math.random.
function deterministicJitter(attempt: number): number {
  const x = Math.sin(attempt + 1) * 10_000;
  return x - Math.floor(x);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { redact };
