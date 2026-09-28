import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { parseWebhook } from "../webhooks/handlers.js";
import { processEvent } from "../webhooks/processor.js";
import { resetStore, getResourceState } from "../webhooks/store.js";
import { createWebhookServer } from "../webhooks/server.js";
import {
  REPLAY_WINDOW_SECONDS,
  signWebhook,
  verifyWebhookSignature,
} from "../webhooks/verify.js";
import { PagouHttpClient } from "../src/lib/http.js";
import type { PagouConfig } from "../src/lib/config.js";

const SECURITY_TOKEN = "test_security_token";
const NOW = 1_700_000_000;
const RAW_BODY =
  '{"id":"evt_1","event":"transaction","data":{"id":"tx_1","event_type":"transaction.paid"}}';

const config: PagouConfig = {
  environment: "sandbox",
  baseUrl: "https://api.sandbox.pagou.ai",
  apiToken: "test",
  timeoutMs: 1000,
  maxRetries: 0,
};

function verify(overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  const timestamp = String(NOW);
  return verifyWebhookSignature({
    securityToken: SECURITY_TOKEN,
    rawBody: RAW_BODY,
    timestamp,
    signature: signWebhook(SECURITY_TOKEN, timestamp, RAW_BODY),
    nowSeconds: NOW,
    ...overrides,
  });
}

beforeEach(() => resetStore());

describe("verifyWebhookSignature", () => {
  it("accepts HMAC-SHA256 of timestamp.rawBody with the Security Token", () => {
    const timestamp = String(NOW);
    const signature = signWebhook(SECURITY_TOKEN, timestamp, RAW_BODY);
    expect(signature.startsWith("sha256=")).toBe(true);
    expect(verify({ timestamp, signature })).toEqual({ ok: true, signed: true });

    const expectedHex = createHmac("sha256", SECURITY_TOKEN)
      .update(`${timestamp}.${RAW_BODY}`, "utf8")
      .digest("hex");
    expect(signature).toBe(`sha256=${expectedHex}`);
  });

  it("signs the exact raw body, including whitespace a re-serialized object would drop", () => {
    const rawBody = '{"id":"evt_1", "event":"transaction"}';
    const timestamp = String(NOW);
    const reserialized = JSON.stringify(JSON.parse(rawBody));
    expect(reserialized).not.toBe(rawBody);
    const signature = signWebhook(SECURITY_TOKEN, timestamp, rawBody);
    expect(verify({ rawBody, timestamp, signature })).toEqual({ ok: true, signed: true });
    expect(verify({ rawBody: reserialized, timestamp, signature })).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects a signature produced with a different Security Token", () => {
    const timestamp = String(NOW);
    const signature = signWebhook("other_security_token", timestamp, RAW_BODY);
    expect(verify({ timestamp, signature })).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("rejects the docs.pagou.com.br scheme (no dot, no sha256= prefix)", () => {
    const timestamp = String(NOW);
    const hex = createHmac("sha256", SECURITY_TOKEN)
      .update(timestamp + RAW_BODY, "utf8")
      .digest("hex");
    expect(verify({ timestamp, signature: hex })).toEqual({ ok: false, error: "invalid_signature" });
    expect(verify({ timestamp, signature: `sha256=${hex}` })).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });

  it("rejects a POST that omits signature headers when a Security Token is configured", () => {
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
    expect(verify({ timestamp: stale, signature: signWebhook(SECURITY_TOKEN, stale, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
    expect(verify({ timestamp: future, signature: signWebhook(SECURITY_TOKEN, future, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("accepts a timestamp on the ±5 minute boundary", () => {
    const edge = String(NOW - REPLAY_WINDOW_SECONDS);
    expect(verify({ timestamp: edge, signature: signWebhook(SECURITY_TOKEN, edge, RAW_BODY) })).toEqual({
      ok: true,
      signed: true,
    });
  });

  it("rejects a timestamp that is not a safe integer even when the MAC matches", () => {
    const timestamp = "9".repeat(20);
    expect(verify({ timestamp, signature: signWebhook(SECURITY_TOKEN, timestamp, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("rejects a non-numeric timestamp even when the MAC matches", () => {
    const timestamp = "not-unix-time";
    expect(verify({ timestamp, signature: signWebhook(SECURITY_TOKEN, timestamp, RAW_BODY) })).toEqual({
      ok: false,
      error: "stale_timestamp",
    });
  });

  it("uses the current clock when nowSeconds is omitted", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      verifyWebhookSignature({
        securityToken: SECURITY_TOKEN,
        rawBody: RAW_BODY,
        timestamp,
        signature: signWebhook(SECURITY_TOKEN, timestamp, RAW_BODY),
      }),
    ).toEqual({ ok: true, signed: true });
  });

  it("treats an empty, null, or undefined Security Token as unsigned", () => {
    for (const securityToken of ["", null, undefined]) {
      expect(
        verifyWebhookSignature({
          securityToken,
          rawBody: RAW_BODY,
          timestamp: undefined,
          signature: undefined,
          nowSeconds: NOW,
        }),
      ).toEqual({ ok: true, signed: false });
    }
  });
});

describe("reconcile remains recommended alongside HMAC", () => {
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

describe("HTTP receiver verifies the raw body before JSON.parse", () => {
  const server = createWebhookServer();
  let port = 0;
  const previousToken = process.env.PAGOU_SECURITY_TOKEN;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (previousToken === undefined) delete process.env.PAGOU_SECURITY_TOKEN;
    else process.env.PAGOU_SECURITY_TOKEN = previousToken;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  function post(
    rawBody: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/webhooks/pagou",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(rawBody),
            "User-Agent": "Pagou.ai - Webhook Service",
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk as Buffer));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", reject);
      req.end(rawBody);
    });
  }

  it("accepts an unsigned POST when PAGOU_SECURITY_TOKEN is unset", async () => {
    delete process.env.PAGOU_SECURITY_TOKEN;
    const rawBody =
      '{"id":"evt_unsigned","event":"transaction","data":{"id":"tx_u","event_type":"transaction.created"}}';
    const response = await post(rawBody);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ received: true });
  });

  it("rejects a missing signature, a bad MAC, a stale timestamp, and a reserialized body", async () => {
    process.env.PAGOU_SECURITY_TOKEN = SECURITY_TOKEN;
    const rawBody =
      '{"id":"evt_signed", "event":"transaction","data":{"id":"tx_s","event_type":"transaction.created"}}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signWebhook(SECURITY_TOKEN, timestamp, rawBody);

    const missing = await post(rawBody);
    expect(missing.status).toBe(401);
    expect(JSON.parse(missing.body)).toEqual({ error: "missing_signature" });

    const badMac = await post(rawBody, {
      "X-Pagou-Timestamp": timestamp,
      "X-Pagou-Signature": signWebhook("other_security_token", timestamp, rawBody),
    });
    expect(badMac.status).toBe(401);
    expect(JSON.parse(badMac.body)).toEqual({ error: "invalid_signature" });

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - REPLAY_WINDOW_SECONDS - 30);
    const stale = await post(rawBody, {
      "X-Pagou-Timestamp": staleTimestamp,
      "X-Pagou-Signature": signWebhook(SECURITY_TOKEN, staleTimestamp, rawBody),
    });
    expect(stale.status).toBe(401);
    expect(JSON.parse(stale.body)).toEqual({ error: "stale_timestamp" });

    const reserialized = JSON.stringify(JSON.parse(rawBody));
    const wrongBody = await post(rawBody, {
      "X-Pagou-Timestamp": timestamp,
      "X-Pagou-Signature": signWebhook(SECURITY_TOKEN, timestamp, reserialized),
    });
    expect(wrongBody.status).toBe(401);
    expect(JSON.parse(wrongBody.body)).toEqual({ error: "invalid_signature" });

    const ok = await post(rawBody, {
      "X-Pagou-Timestamp": timestamp,
      "X-Pagou-Signature": signature,
    });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({ received: true });
  });
});
