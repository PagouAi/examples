#!/usr/bin/env node
// Zero-dependency mock server that replays the Pagou API v2 contract for the
// example flows (transactions, transfers, subscriptions, customers,
// checkout-links) plus webhook helpers. For contract tests and local dev only.
import { createServer } from 'node:http';
import { isAuthorized } from './lib/auth.mjs';
import { createStore, newId } from './lib/store.mjs';
import {
  envelope,
  apiError,
  buildTransaction,
  toTransactionListItem,
  buildRefund,
  buildTransfer,
  buildCustomer,
  buildSubscription,
  buildCheckoutLink,
} from './lib/responses.mjs';

const store = createStore();

function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) reject(new Error('payload too large'));
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function paginate(items, query) {
  const limit = Math.min(Number(query.get('limit')) || 20, 100);
  const cursor = query.get('cursor');
  let start = 0;
  if (cursor) {
    const idx = items.findIndex((i) => i.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const page = items.slice(start, start + limit);
  const next = start + limit < items.length ? page[page.length - 1]?.id ?? null : null;
  const prev = start > 0 ? items[Math.max(start - limit, 0)]?.id ?? null : null;
  return { page, next, prev, total: items.length };
}

// Route table: [method, RegExp, handler]. Handler receives (ctx).
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

// ---- Transactions ---------------------------------------------------------

route('POST', /^\/v2\/transactions$/, ({ res, body, req }) => {
  const idem = req.headers['idempotency-key'];
  if (idem && store.idempotency.has(idem)) {
    return json(res, 201, store.idempotency.get(idem));
  }
  if (body.external_ref && store.externalRefs.has(body.external_ref)) {
    const e = apiError(409, 'DUPLICATE_EXTERNAL_REF', 'A transaction with this external reference already exists');
    return json(res, e.status, e.body);
  }
  if (body.amount === undefined || body.method === undefined) {
    const e = apiError(422, 'VALIDATION_ERROR', 'amount and method are required');
    return json(res, e.status, e.body);
  }
  const txn = buildTransaction(body);
  store.transactions.set(txn.id, txn);
  if (body.external_ref) store.externalRefs.add(body.external_ref);
  const payload = envelope(txn);
  if (idem) store.idempotency.set(idem, payload);
  json(res, 201, payload);
});

route('GET', /^\/v2\/transactions$/, ({ res, query }) => {
  const { page, next, prev, total } = paginate([...store.transactions.values()], query);
  const items = page.map(toTransactionListItem);
  json(res, 200, envelope(items, { next_cursor: next, prev_cursor: prev, total }));
});

route('GET', /^\/v2\/transactions\/([^/]+)$/, ({ res, params }) => {
  const txn = store.transactions.get(params[0]);
  if (!txn) return notFound(res, 'transaction');
  json(res, 200, envelope(txn));
});

route('PUT', /^\/v2\/transactions\/([^/]+)$/, ({ res, params, body }) => {
  const txn = store.transactions.get(params[0]);
  if (!txn) return notFound(res, 'transaction');
  Object.assign(txn, { metadata: body.metadata ?? txn.metadata, updated_at: new Date().toISOString() });
  json(res, 200, envelope(txn));
});

route('PUT', /^\/v2\/transactions\/([^/]+)\/refund$/, ({ res, params, body }) => {
  const txn = store.transactions.get(params[0]);
  if (!txn) return notFound(res, 'transaction');
  const result = buildRefund(txn, body.amount);
  txn.refunded_amount = (txn.refunded_amount ?? 0) + result.amount_refunded;
  txn.status = result.is_full_refund ? 'refunded' : 'partially_refunded';
  json(res, 200, envelope(result));
});

route('PUT', /^\/v2\/transactions\/([^/]+)\/delivery$/, ({ res, params }) => {
  const txn = store.transactions.get(params[0]);
  if (!txn) return notFound(res, 'transaction');
  json(res, 200, envelope({ id: txn.id, delivery_status: 'delivered' }));
});

// ---- Checkout links -------------------------------------------------------

route('POST', /^\/v2\/checkout-links$/, ({ res }) => {
  json(res, 201, envelope(buildCheckoutLink()));
});

// ---- Customers ------------------------------------------------------------

route('POST', /^\/v2\/customers$/, ({ res, body }) => {
  if (!body.name || !body.email) {
    const e = apiError(422, 'VALIDATION_ERROR', 'name and email are required');
    return json(res, e.status, e.body);
  }
  const customer = buildCustomer(body);
  store.customers.set(customer.id, customer);
  json(res, 201, envelope(customer));
});

route('GET', /^\/v2\/customers$/, ({ res, query }) => {
  const { page, next, prev, total } = paginate([...store.customers.values()], query);
  json(res, 200, envelope(page, { metadata: { next_cursor: next, prev_cursor: prev, total } }));
});

route('GET', /^\/v2\/customers\/([^/]+)$/, ({ res, params }) => {
  const customer = store.customers.get(params[0]);
  if (!customer) return notFound(res, 'customer');
  json(res, 200, envelope(customer));
});

// ---- Subscriptions --------------------------------------------------------

route('POST', /^\/v2\/subscriptions$/, ({ res, body }) => {
  const sub = buildSubscription(body);
  store.subscriptions.set(sub.id, sub);
  json(res, 201, envelope(sub));
});

route('GET', /^\/v2\/subscriptions$/, ({ res, query }) => {
  const { page, next, prev, total } = paginate([...store.subscriptions.values()], query);
  json(res, 200, envelope(page, { next_cursor: next, prev_cursor: prev, total }));
});

route('GET', /^\/v2\/subscriptions\/([^/]+)$/, ({ res, params }) => {
  const sub = store.subscriptions.get(params[0]);
  if (!sub) return notFound(res, 'subscription');
  json(res, 200, envelope(sub));
});

route('PATCH', /^\/v2\/subscriptions\/([^/]+)$/, ({ res, params, body }) => {
  const sub = store.subscriptions.get(params[0]);
  if (!sub) return notFound(res, 'subscription');
  if (body.cancelAtPeriodEnd !== undefined) sub.cancelAtPeriodEnd = body.cancelAtPeriodEnd;
  sub.updatedAt = new Date().toISOString();
  json(res, 200, envelope(sub));
});

route('POST', /^\/v2\/subscriptions\/([^/]+)\/cancel$/, ({ res, params, body }) => {
  const sub = store.subscriptions.get(params[0]);
  if (!sub) return notFound(res, 'subscription');
  sub.status = 'canceled';
  sub.canceledAt = new Date().toISOString();
  sub.cancellationReason = 'user_requested';
  json(res, 200, envelope(sub));
});

// ---- Transfers ------------------------------------------------------------

route('POST', /^\/v2\/transfers$/, ({ res, body }) => {
  if (!body.pix_key_type || !body.pix_key_value || body.amount === undefined) {
    const e = apiError(422, 'VALIDATION_ERROR', 'pix_key_type, pix_key_value and amount are required');
    return json(res, e.status, e.body);
  }
  const transfer = buildTransfer(body);
  store.transfers.set(transfer.id, transfer);
  json(res, 201, envelope(transfer));
});

route('GET', /^\/v2\/transfers$/, ({ res, query }) => {
  const { page, next, prev, total } = paginate([...store.transfers.values()], query);
  json(res, 200, envelope(page, { next_cursor: next, prev_cursor: prev, total }));
});

route('GET', /^\/v2\/transfers\/([^/]+)$/, ({ res, params }) => {
  const transfer = store.transfers.get(params[0]);
  if (!transfer) return notFound(res, 'transfer');
  json(res, 200, envelope(transfer));
});

route('POST', /^\/v2\/transfers\/([^/]+)\/cancel$/, ({ res, params }) => {
  const transfer = store.transfers.get(params[0]);
  if (!transfer) return notFound(res, 'transfer');
  if (transfer.status !== 'pending') {
    const e = apiError(409, 'INVALID_STATE', 'Transfer can no longer be canceled');
    return json(res, e.status, e.body);
  }
  transfer.status = 'cancelled';
  transfer.updated_at = new Date().toISOString();
  json(res, 200, envelope(transfer));
});

function notFound(res, kind) {
  const e = apiError(404, 'NOT_FOUND', `No ${kind} found for the given id`);
  json(res, e.status, e.body);
}

// ---- Non-contract control plane (never a real API prefix) -----------------

function handleControl(req, res, pathname, body) {
  if (pathname === '/__mock/health') return json(res, 200, { status: 'ok' });
  if (pathname === '/__mock/reset') {
    const fresh = createStore();
    Object.assign(store, fresh);
    return json(res, 200, { reset: true });
  }
  if (pathname === '/__mock/webhook' && req.method === 'POST') {
    // Echo back a normalized webhook delivery envelope for handler tests.
    const family = body.family || 'transactions';
    const id = body.id || newId();
    return json(res, 200, { delivered: true, id, family });
  }
  return json(res, 404, { error: 'NOT_FOUND', message: 'Unknown control endpoint', status: 404 });
}

export function createMockServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        body = await readBody(req);
      } catch {
        return json(res, 400, { error: 'BAD_REQUEST', message: 'Invalid request body', status: 400 });
      }
    }

    // Readiness probes (no auth): /__mock/health, /health and root.
    if (pathname.startsWith('/__mock/')) return handleControl(req, res, pathname, body);
    if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
      return json(res, 200, { status: 'ok' });
    }

    if (!isAuthorized(req)) {
      return json(res, 401, { error: 'UNAUTHORIZED', message: 'Missing or invalid credentials', status: 401 });
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      return r.handler({ req, res, body, query: url.searchParams, params: m.slice(1) });
    }

    json(res, 404, { error: 'NOT_FOUND', message: `No route for ${req.method} ${pathname}`, status: 404 });
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT) || 4010;
  createMockServer().listen(port, () => {
    console.log(`Pagou mock server listening on http://localhost:${port}`);
  });
}
