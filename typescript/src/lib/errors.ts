export interface ApiErrorFields {
  status?: number;
  code?: string;
  requestId?: string;
  details?: unknown;
  raw?: unknown;
  cause?: unknown;
}

/** Base class for every error surfaced by the raw HTTP reference client. */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly raw?: unknown;

  constructor(message: string, fields: ApiErrorFields = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = fields.status;
    this.code = fields.code;
    this.requestId = fields.requestId;
    this.details = fields.details;
    this.raw = fields.raw;
    if (fields.cause !== undefined) {
      (this as { cause?: unknown }).cause = fields.cause;
    }
  }
}

export class AuthenticationError extends ApiError {} // 401
export class PermissionError extends ApiError {} // 403
export class InvalidRequestError extends ApiError {} // 400/422 and other 4xx
export class NotFoundError extends ApiError {} // 404
export class ConflictError extends ApiError {} // 409 (e.g. duplicate external_ref)
export class RateLimitError extends ApiError {} // 429
export class ServerError extends ApiError {} // 5xx
export class NetworkError extends ApiError {} // transport failure / timeout

interface ParsedError {
  message: string;
  code?: string;
  requestId?: string;
  details?: unknown;
}

/**
 * Normalizes the two documented error shapes: the simple
 * `{ error, message, status }` body and RFC 7807 `application/problem+json`
 * (`{ title, detail, errors[] }`).
 */
function parseErrorBody(body: unknown, fallbackRequestId?: string): ParsedError {
  if (!body || typeof body !== "object") {
    return { message: "Request failed", requestId: fallbackRequestId };
  }
  const obj = body as Record<string, unknown>;
  const message =
    (typeof obj.message === "string" && obj.message) ||
    (typeof obj.detail === "string" && obj.detail) ||
    (typeof obj.title === "string" && obj.title) ||
    (typeof obj.error === "string" && obj.error) ||
    "Request failed";
  const code = typeof obj.code === "string" ? obj.code : typeof obj.error === "string" ? obj.error : undefined;
  const requestId =
    typeof obj.requestId === "string"
      ? obj.requestId
      : typeof obj.request_id === "string"
        ? obj.request_id
        : fallbackRequestId;
  const details = obj.errors ?? obj.details ?? undefined;
  return { message, code, requestId, details };
}

/** Maps an HTTP status + response body to the matching typed error. */
export function toApiError(status: number, body: unknown, requestIdFromHeader?: string): ApiError {
  const parsed = parseErrorBody(body, requestIdFromHeader);
  const fields: ApiErrorFields = {
    status,
    code: parsed.code,
    requestId: parsed.requestId,
    details: parsed.details,
    raw: body,
  };
  switch (status) {
    case 401:
      return new AuthenticationError(parsed.message, fields);
    case 403:
      return new PermissionError(parsed.message, fields);
    case 404:
      return new NotFoundError(parsed.message, fields);
    case 409:
      return new ConflictError(parsed.message, fields);
    case 429:
      return new RateLimitError(parsed.message, fields);
    default:
      return status >= 500 ? new ServerError(parsed.message, fields) : new InvalidRequestError(parsed.message, fields);
  }
}
