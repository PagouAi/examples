// In-memory persistence stand-ins. A real integration would back these with a
// database: the processed-events table gives idempotency across redeliveries,
// and the business-state table is the record you actually fulfill against.

const processedEvents = new Set<string>();
const businessState = new Map<string, string>();

/** True the first time an event id is seen; false for any redelivery. */
export function markProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false;
  processedEvents.add(eventId);
  return true;
}

export function hasProcessed(eventId: string): boolean {
  return processedEvents.has(eventId);
}

/** Records the reconciled state of a resource (the fulfillable source of truth). */
export function setResourceState(resourceId: string, state: string): void {
  businessState.set(resourceId, state);
}

export function getResourceState(resourceId: string): string | undefined {
  return businessState.get(resourceId);
}

/** Test/support helper to reset the in-memory stores. */
export function resetStore(): void {
  processedEvents.clear();
  businessState.clear();
}
