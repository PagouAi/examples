import { createHmac, timingSafeEqual } from "node:crypto";

/** Receivers should reject a timestamp more than this many seconds from now. */
export const REPLAY_WINDOW_SECONDS = 5 * 60;

export const SIGNATURE_PREFIX = "sha256=";

/** Lowercase form of `X-Pagou-Timestamp` (Node presents incoming headers this way). */
export const TIMESTAMP_HEADER = "x-pagou-timestamp";

/** Lowercase form of `X-Pagou-Signature`. */
export const SIGNATURE_HEADER = "x-pagou-signature";

export type SignatureError = "missing_signature" | "invalid_signature" | "stale_timestamp";

export type SignatureResult =
  | { ok: true; signed: boolean }
  | { ok: false; error: SignatureError };

export interface VerifyWebhookInput {
  /** Security Token from the webhook subscription. Empty, null, or undefined means the POST is unsigned. */
  securityToken: string | null | undefined;
  /** Exact HTTP body Pagou signed. Read it before `JSON.parse`. */
  rawBody: string;
  /** `X-Pagou-Timestamp` value (Unix seconds, decimal string). */
  timestamp: string | undefined;
  /** `X-Pagou-Signature` value (`sha256=<hex>`). */
  signature: string | undefined;
  /** Override for tests. Defaults to the current Unix time in seconds. */
  nowSeconds?: number;
  /** Override for tests. Defaults to {@link REPLAY_WINDOW_SECONDS}. */
  replayWindowSeconds?: number;
}

/**
 * HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` keyed with the Security Token.
 * Returns the header value `sha256=<lowercase hex>`.
 */
export function signWebhook(securityToken: string, timestamp: string, rawBody: string): string {
  const digest = createHmac("sha256", securityToken)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuf = Buffer.from(actual, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

function timestampIsFresh(timestamp: string, nowSeconds: number, windowSeconds: number): boolean {
  if (!/^\d+$/.test(timestamp)) return false;
  const parsed = Number(timestamp);
  if (!Number.isSafeInteger(parsed)) return false;
  return Math.abs(nowSeconds - parsed) <= windowSeconds;
}

/**
 * Verifies `X-Pagou-Signature` on the raw body.
 *
 * No Security Token accepts the POST as unsigned (`signed: false`). When a token
 * is set, both headers are required, the MAC is compared with `timingSafeEqual`,
 * and a matching signature still fails outside the ±5 minute replay window.
 */
export function verifyWebhookSignature(input: VerifyWebhookInput): SignatureResult {
  if (input.securityToken == null || input.securityToken === "") {
    return { ok: true, signed: false };
  }

  const timestamp = input.timestamp?.trim() ?? "";
  const signature = input.signature?.trim() ?? "";
  if (timestamp === "" || signature === "") {
    return { ok: false, error: "missing_signature" };
  }

  const expected = signWebhook(input.securityToken, timestamp, input.rawBody);
  if (!signaturesMatch(signature, expected)) {
    return { ok: false, error: "invalid_signature" };
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const windowSeconds = input.replayWindowSeconds ?? REPLAY_WINDOW_SECONDS;
  if (!timestampIsFresh(timestamp, nowSeconds, windowSeconds)) {
    return { ok: false, error: "stale_timestamp" };
  }

  return { ok: true, signed: true };
}
