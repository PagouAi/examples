import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseWebhook } from "../webhooks/handlers.js";
import { processEvent } from "../webhooks/processor.js";
import { resetStore, getResourceState } from "../webhooks/store.js";
import {
  REPLAY_WINDOW_SECONDS,
  signWebhook,
  verifyWebhookSignature,
} from "../webhooks/verify.js";
import { PagouHttpClient } from "../src/lib/http.js";
import type { PagouConfig } from "../src/lib/config.js";

const SECRET = "whsec_test_secret";
const NOW = 1_700_000_000;
const RAW_BODY = '{"id":"evt_1","event":"transaction","data":{"id":"tx_1","event_type":"transaction.paid"}}';

const config: PagouConfig = {
  environment: "sandbox",
  baseUrl: "https://api.sandbox.pagou.ai",
  apiToken: "test",
  timeoutMs: 1000,
  maxRetries: 0,
};

function verify(
  overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {},
) {
  const timestamp = String(NOW);
  return verifyWebhookSignature({
    secret: SECRET,
    rawBody: RAW_BODY,
    timestamp,
    signature: signWebhook(SECRET, timestamp, RAW_BODY),
    nowSeconds: NOW,
    ...overrides,
  });
}

beforeEach(() => resetStore());

describe("verifyWebhookSignature", () => {
  it("accepts HMAC-SHA256 of timestamp.rawBody with the configured secret", () => {
    const timestamp = String(NOW);
    const signature = signWebhook(SECRET, timestamp, RAW_BODY);
    expect(signature.startsWith("sha256=")).toBe(true);
    expect(verify({ timestamp, signature })).toEqual({ ok: true, signed: true });
  });

  it("signs the exact raw body, including whitespace a re-serialized object would drop", () => {
    const rawBody = '{"id":"evt_1", "event":"transaction"}';
    const timestamp = String(NOW);
    const reserialized = JSON.stringify(JSON.parse(rawBody));
    expect(reserialized).not.toBe(rawBody);
    const signature = signWebhook(SECRET, timestamp, rawBody);
    expect(verify({ rawBody, timestamp, signature })).toEqual({ ok: true, signed: true });
    expect(verify({ rawBody: reserialized, timestamp, signature })).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects a signature produced with the wrong secret", () => {
    const timestamp = String(NOW);
    const signature = signWebhook("whsec_other", timestamp, RAW_BODY);
    expect(verify({ timestamp, signature })).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects the docs.pagou.com.br scheme (no dot, no sha256= prefix)", () => {
    const timestamp = String(NOW);
    const hex = createHmac("sha256", SECRET).update(timestamp + RAW_BODY, "utf8").digest("hex");
    expect(verify({ timestamp, signature: hex })).toEqual({ ok: false, error: "invalid_signature" });
    expect(verify({ timestamp, signature: `sha256=${hex}` })).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects a delivery that omits signature headers when a secret is configured", () => {
    expect(verify({ timestamp: undefined, signature: undefined })).toEqual({
      ok: false,
      error: "missing_signature",
    });
    expect(verify({ signature: undefined })).toEqual({ ok: false, error: "missing_signature" });
    expect(verify({ timestamp: undefined })).toEqual({ ok: false, error: "missing_signature" });
    expect(verify({ timestamp: "   ", signature: "   " })).toEqual({
      ok: false,
      error: "missing_signature",
    });
  });

  it("rejects a matching signature whose timestamp is outside ±5 minutes", () => {
    const stale = String(NOW - REPLAY_WINDOW_SECONDS - 1);
    const future = String(NOW + REPLAY_WINDOW_SECONDS + 1);
    expect(verify({ timestamp: stale, signature: signWebhook(SECRET, stale, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
    expect(verify({ timestamp: future, signature: signWebhook(SECRET, future, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("accepts a timestamp on the ±5 minute boundary", () => {
    const edge = String(NOW - REPLAY_WINDOW_SECONDS);
    expect(verify({ timestamp: edge, signature: signWebhook(SECRET, edge, RAW_BODY) })).toEqual({
      ok: true,
      signed: true,
    });
  });

  it("rejects a timestamp that is not a safe integer even when the MAC matches", () => {
    const timestamp = "9".repeat(20);
    expect(verify({ timestamp, signature: signWebhook(SECRET, timestamp, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("rejects a non-numeric timestamp even when the MAC matches", () => {
    const timestamp = "not-unix-time";
    expect(verify({ timestamp, signature: signWebhook(SECRET, timestamp, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("uses the current clock when nowSeconds is omitted", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: RAW_BODY,
        timestamp,
        signature: signWebhook(SECRET, timestamp, RAW_BODY),
      }),
    ).toEqual({ ok: true, signed: true });
  });

  it("treats an empty, null, or undefined secret as unsigned", () => {
    for (const secret of ["", null, undefined]) {
      expect(
        verifyWebhookSignature({
          secret,
          rawBody: RAW_BODY,
          timestamp: undefined,
          signature: undefined,
          nowSeconds: NOW,
        }),
      ).toEqual({ ok: true, signed: false });
    }
  });
});

describe("reconcile remains best practice alongside HMAC", () => {
  it("still loads the resource with GET after a valid signature", async () => {
    const verified = verify();
    expect(verified).toEqual({ ok: true, signed: true });

    const event = parseWebhook(JSON.parse(RAW_BODY));
    expect("error" in event).toBe(false);
    if ("error" in event) return;

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, requestId: "r", data: { status: "paid" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await processEvent(event, client);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestUrl = String((fetchImpl.mock.calls as unknown[][])[0]?.[0]);
    expect(requestUrl).toContain("/v2/transactions/tx_1");
    expect(getResourceState("tx_1")).toBe("paid");
  });
});
