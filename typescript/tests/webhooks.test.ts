import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseWebhook, isConfirmedStateChange } from "../webhooks/handlers.js";
import { processEvent } from "../webhooks/processor.js";
import { markProcessed, getResourceState, resetStore } from "../webhooks/store.js";
import { PagouHttpClient } from "../src/lib/http.js";
import type { PagouConfig } from "../src/lib/config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

const config: PagouConfig = {
  environment: "sandbox",
  baseUrl: "https://api.sandbox.pagou.ai",
  apiToken: "test",
  timeoutMs: 1000,
  maxRetries: 0,
};

beforeEach(() => resetStore());

describe("parseWebhook", () => {
  it("routes the transaction family via data.event_type", () => {
    const event = parseWebhook({ id: "evt_1", event: "transaction", data: { id: "tx_1", event_type: "transaction.paid" } });
    expect(event).toMatchObject({ id: "evt_1", family: "transaction", eventType: "transaction.paid", resourceId: "tx_1" });
  });

  it("routes the subscription family", () => {
    const event = parseWebhook({ id: "evt_2", event: "subscription", data: { id: "sub_1", event_type: "subscription.renewed" } });
    expect(event).toMatchObject({ family: "subscription", eventType: "subscription.renewed", resourceId: "sub_1" });
  });

  it("routes the transfer family via top-level type and data.object", () => {
    const event = parseWebhook({ id: "evt_3", type: "payout.transferred", data: { object: { id: "tr_1" } } });
    expect(event).toMatchObject({ family: "transfer", eventType: "payout.transferred", resourceId: "tr_1" });
  });

  it("rejects a body with no event id", () => {
    expect(parseWebhook({ event: "transaction", data: {} })).toEqual({ error: "missing_event_id" });
  });

  it("parses each family fixture without error", () => {
    for (const name of ["webhook.transaction.json", "webhook.subscription.json", "webhook.transfer.json"]) {
      expect("error" in parseWebhook(loadFixture(name))).toBe(false);
    }
  });
});

describe("isConfirmedStateChange", () => {
  it("treats terminal money events as confirmed", () => {
    expect(isConfirmedStateChange("transaction.paid")).toBe(true);
    expect(isConfirmedStateChange("payout.transferred")).toBe(true);
  });
  it("treats informational events as non-confirming", () => {
    expect(isConfirmedStateChange("transaction.created")).toBe(false);
    expect(isConfirmedStateChange("subscription.trial_will_end")).toBe(false);
  });
});

describe("dedupe", () => {
  it("returns true once then false for redeliveries", () => {
    expect(markProcessed("evt_x")).toBe(true);
    expect(markProcessed("evt_x")).toBe(false);
  });
});

describe("processEvent", () => {
  it("reconciles against the API and updates state on a confirmed event", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, requestId: "r", data: { status: "paid" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await processEvent(
      { id: "evt_1", family: "transaction", eventType: "transaction.paid", resourceId: "tx_1", raw: {} },
      client,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getResourceState("tx_1")).toBe("paid");
  });

  it("does not reconcile or change state on a non-confirming event", async () => {
    const fetchImpl = vi.fn();
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await processEvent(
      { id: "evt_2", family: "transaction", eventType: "transaction.created", resourceId: "tx_2", raw: {} },
      client,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getResourceState("tx_2")).toBeUndefined();
  });

  it("skips reconciliation when the confirmed event has no resource id", async () => {
    const fetchImpl = vi.fn();
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await processEvent(
      { id: "evt_3", family: "transaction", eventType: "transaction.paid", resourceId: "", raw: {} },
      client,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leaves state unchanged when the resource is not found", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } }),
    );
    const client = new PagouHttpClient(config, fetchImpl as unknown as typeof fetch);
    await processEvent(
      { id: "evt_4", family: "transfer", eventType: "payout.transferred", resourceId: "tr_x", raw: {} },
      client,
    );
    expect(getResourceState("tr_x")).toBeUndefined();
  });
});
