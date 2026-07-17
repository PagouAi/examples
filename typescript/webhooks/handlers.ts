// Parsing for the three webhook envelope families. The public contract exposes
// no signature header, so authenticity is established downstream by reconciling
// against the API — never by trusting these bodies. Every family carries a
// top-level `id` that is THE dedupe key (a resource emits many events over
// time, so deduping by resource id would drop distinct events).

export type WebhookFamily = "transaction" | "subscription" | "transfer";

export interface WebhookEvent {
  /** Top-level event id — the idempotency/dedupe key. */
  id: string;
  family: WebhookFamily;
  /** Concrete event name, e.g. `transaction.paid` or `payout.transferred`. */
  eventType: string;
  /** Public id of the affected resource, used to reconcile against the API. */
  resourceId: string;
  raw: unknown;
}

export interface ParseFailure {
  error: "missing_event_id" | "unknown_envelope";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Routes a raw webhook body to one of the three families and extracts the
 * dedupe id, event type and resource id. Returns a typed failure instead of
 * throwing so the server can answer with the documented error body.
 */
export function parseWebhook(body: unknown): WebhookEvent | ParseFailure {
  const envelope = asRecord(body);
  if (!envelope) return { error: "unknown_envelope" };

  const id = typeof envelope.id === "string" ? envelope.id : null;
  if (!id) return { error: "missing_event_id" };

  // Transactions: envelope `event = "transaction"`, name in `data.event_type`.
  if (envelope.event === "transaction") {
    const data = asRecord(envelope.data);
    return {
      id,
      family: "transaction",
      eventType: String(data?.event_type ?? "transaction.unknown"),
      resourceId: String(data?.id ?? ""),
      raw: body,
    };
  }

  // Subscriptions: envelope `event = "subscription"`, name in `data.event_type`.
  if (envelope.event === "subscription") {
    const data = asRecord(envelope.data);
    return {
      id,
      family: "subscription",
      eventType: String(data?.event_type ?? "subscription.unknown"),
      resourceId: String(data?.id ?? ""),
      raw: body,
    };
  }

  // Transfers: top-level `type`, resource in `data.object`.
  if (typeof envelope.type === "string") {
    const data = asRecord(envelope.data);
    const object = asRecord(data?.object);
    return {
      id,
      family: "transfer",
      eventType: envelope.type,
      resourceId: String(object?.id ?? ""),
      raw: body,
    };
  }

  return { error: "unknown_envelope" };
}

/** Event types that assert a confirmed, fulfillable state change. */
const CONFIRMED_EVENTS: ReadonlySet<string> = new Set([
  "transaction.paid",
  "transaction.refunded",
  "transaction.partially_refunded",
  "transaction.chargedback",
  "subscription.renewed",
  "subscription.payment_failed",
  "subscription.past_due",
  "subscription.canceled",
  "payout.transferred",
  "payout.failed",
  "payout.rejected",
  "payout.canceled",
]);

/** Whether an event should trigger reconciliation + a business-state change. */
export function isConfirmedStateChange(eventType: string): boolean {
  return CONFIRMED_EVENTS.has(eventType);
}
