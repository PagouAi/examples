import { describe, it, expect, vi } from "vitest";
import { PagouHttpClient } from "../src/lib/http.js";
import { NotFoundError, ServerError, NetworkError } from "../src/lib/errors.js";
import type { PagouConfig } from "../src/lib/config.js";

const config: PagouConfig = {
  environment: "sandbox",
  baseUrl: "https://api.sandbox.pagou.ai",
  apiToken: "test_token",
  timeoutMs: 1000,
  maxRetries: 1,
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("PagouHttpClient", () => {
  it("unwraps the { success, requestId, data } envelope", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, requestId: "req_1", data: { id: "tx_1" } }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);

    const { data, requestId } = await client.requestData<{ id: string }>({ method: "GET", path: "/v2/transactions/tx_1" });
    expect(data.id).toBe("tx_1");
    expect(requestId).toBe("req_1");
  });

  it("sends Authorization and a generated correlation id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, requestId: "r", data: {} }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await client.requestData({ method: "GET", path: "/v2/transactions" });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test_token");
    expect(headers.get("X-Request-Id")).toMatch(/[0-9a-f-]{36}/);
  });

  it("maps a 404 to NotFoundError without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { message: "not found", code: "NOT_FOUND" }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);

    await expect(client.requestData({ method: "GET", path: "/v2/transactions/x" })).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 on GET, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, requestId: "r", data: { ok: true } }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);

    const { data } = await client.requestData<{ ok: boolean }>({ method: "GET", path: "/v2/transactions" });
    expect(data.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a POST without an idempotency key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(500, { message: "boom" }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);

    await expect(client.requestData({ method: "POST", path: "/v2/transactions", body: {} })).rejects.toBeInstanceOf(ServerError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a POST when an idempotency key is present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: "unavailable" }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, requestId: "r", data: { id: "tx" } }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);

    const { data } = await client.requestData<{ id: string }>({
      method: "POST",
      path: "/v2/transactions",
      body: {},
      idempotencyKey: "idem_1",
    });
    expect(data.id).toBe("tx");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Headers).get("Idempotency-Key")).toBe("idem_1");
  });

  it("raises NetworkError with a timeout message when the request aborts", async () => {
    const hangingFetch = (_url: URL, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const client = new PagouHttpClient({ ...config, timeoutMs: 30, maxRetries: 0 }, hangingFetch as unknown as typeof fetch);

    const error = await client.requestData({ method: "GET", path: "/v2/transactions" }).catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toBe("Request timed out");
  });

  it("serializes array query params as comma-joined values", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, requestId: "r", data: [], next_cursor: null, prev_cursor: null, total: 0 }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await client.requestCursorPage({ method: "GET", path: "/v2/transactions", query: { paymentMethods: ["pix", "credit_card"] } });

    const [url] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("paymentMethods")).toBe("pix,credit_card");
  });
});
