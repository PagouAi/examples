import { randomUUID } from 'node:crypto';

// In-memory state for a mock-server process. Not persisted; reset via /__mock/reset.
export function createStore() {
  return {
    transactions: new Map(),
    transfers: new Map(),
    customers: new Map(),
    subscriptions: new Map(),
    idempotency: new Map(),
    externalRefs: new Set(),
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return randomUUID();
}

export function requestId() {
  return randomUUID();
}
