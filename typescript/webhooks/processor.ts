import { PagouHttpClient } from "../src/lib/http.js";
import { logger } from "../src/lib/logger.js";
import { NotFoundError } from "../src/lib/errors.js";
import { isConfirmedStateChange, type WebhookEvent } from "./handlers.js";
import { setResourceState } from "./store.js";

const RESOURCE_PATH: Record<WebhookEvent["family"], string> = {
  transaction: "/v2/transactions",
  subscription: "/v2/subscriptions",
  transfer: "/v2/transfers",
};

/**
 * The offloaded, slow half of webhook handling. It runs AFTER the fast 2xx ack.
 * Business state changes only on a confirmed event, and only after reconciling
 * against the API — the webhook body is a hint, the API is the source of truth.
 */
export async function processEvent(event: WebhookEvent, client = new PagouHttpClient()): Promise<void> {
  if (!isConfirmedStateChange(event.eventType)) {
    logger.info(`Ignoring non-confirming event ${event.eventType} (${event.id})`);
    return;
  }
  if (!event.resourceId) {
    logger.warn(`Confirmed event ${event.eventType} without a resource id — cannot reconcile.`);
    return;
  }

  try {
    const { data } = await client.requestData<{ status: string }>({
      method: "GET",
      path: `${RESOURCE_PATH[event.family]}/${event.resourceId}`,
    });
    setResourceState(event.resourceId, data.status);
    logger.info(`Reconciled ${event.family} ${event.resourceId} → ${data.status}`);
  } catch (error) {
    if (error instanceof NotFoundError) {
      logger.warn(`Resource ${event.resourceId} not found during reconciliation.`);
      return;
    }
    // Reconciliation failed after the ack: a real system would requeue this
    // event for a later retry rather than replaying side effects.
    logger.error(`Reconciliation failed for ${event.id}`, {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
