import { PagouHttpClient } from "./http.js";
import { NotFoundError } from "./errors.js";
import { TERMINAL_PAID_STATUSES, type Transaction, type TransactionStatus } from "./types.js";

export type FulfillmentDecision = "fulfill" | "wait" | "cancel";

// Terminal failure/cancel states: stop waiting, release the order.
const TERMINAL_FAILED: ReadonlySet<TransactionStatus> = new Set([
  "canceled",
  "expired",
  "refused",
]);

/** Maps a transaction status to a business decision. Never fulfill on a pending state. */
export function decideFulfillment(status: TransactionStatus): FulfillmentDecision {
  if (TERMINAL_PAID_STATUSES.has(status)) return "fulfill";
  if (TERMINAL_FAILED.has(status)) return "cancel";
  return "wait";
}

/**
 * Server-side reconciliation: fetch the transaction from the API (the source of
 * truth) and decide whether to fulfill. Business state changes only on this
 * confirmed result, never on an unverified webhook body.
 */
export async function reconcileTransaction(
  id: string,
  client = new PagouHttpClient(),
): Promise<{ transaction: Transaction; decision: FulfillmentDecision } | null> {
  try {
    const { data: transaction } = await client.requestData<Transaction>({
      method: "GET",
      path: `/v2/transactions/${id}`,
    });
    return { transaction, decision: decideFulfillment(transaction.status) };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
