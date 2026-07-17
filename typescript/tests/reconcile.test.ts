import { describe, it, expect, vi } from "vitest";
import { decideFulfillment, reconcileTransaction } from "../src/lib/reconcile.js";
import { PagouHttpClient } from "../src/lib/http.js";
import type { PagouConfig } from "../src/lib/config.js";

const config: PagouConfig = {
  environment: "sandbox",
  baseUrl: "https://api.sandbox.pagou.ai",
  apiToken: "test",
  timeoutMs: 1000,
  maxRetries: 0,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("decideFulfillment", () => {
  it("fulfills only on settled statuses", () => {
    expect(decideFulfillment("paid")).toBe("fulfill");
    expect(decideFulfillment("captured")).toBe("fulfill");
  });

  it("waits on non-terminal statuses", () => {
    expect(decideFulfillment("pending")).toBe("wait");
    expect(decideFulfillment("three_ds_required")).toBe("wait");
    expect(decideFulfillment("processing")).toBe("wait");
  });

  it("cancels on terminal failures", () => {
    expect(decideFulfillment("expired")).toBe("cancel");
    expect(decideFulfillment("refused")).toBe("cancel");
    expect(decideFulfillment("canceled")).toBe("cancel");
  });
});

describe("reconcileTransaction", () => {
  it("fetches the transaction and returns a fulfillment decision", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { success: true, requestId: "r", data: { id: "tx_1", status: "paid" } }),
    );
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    const result = await reconcileTransaction("tx_1", client);
    expect(result?.decision).toBe("fulfill");
    expect(result?.transaction.status).toBe("paid");
  });

  it("returns null when the transaction does not exist", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404, { message: "not found" }));
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    expect(await reconcileTransaction("missing", client)).toBeNull();
  });
});
