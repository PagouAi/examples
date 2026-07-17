import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockServer } from '../server.mjs';
import { validate } from './schema-validate.mjs';
import { loadSpec, operationIndex } from '../../contracts/tools/lib/openapi.mjs';

const spec = loadSpec();
const { byId } = operationIndex(spec);

let server;
let base;
const AUTH = { authorization: 'Bearer sk_test_SYNTHETIC', 'content-type': 'application/json' };

before(async () => {
  server = createMockServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, { body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...AUTH, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Asserts a response body matches the operation's response schema for a status.
function assertContract(operationId, status, body) {
  const entry = byId.get(operationId);
  assert.ok(entry, `operation ${operationId} exists in contract`);
  const resp = entry.op.responses?.[String(status)];
  assert.ok(resp, `operation ${operationId} documents status ${status}`);
  const schema = resp.content?.['application/json']?.schema;
  if (!schema) return;
  const errors = validate(schema, body);
  assert.equal(errors.length, 0, `contract violations for ${operationId} ${status}:\n${errors.join('\n')}`);
}

test('health check needs no auth', async () => {
  const res = await fetch(base + '/__mock/health');
  assert.equal(res.status, 200);
});

test('rejects unauthenticated requests', async () => {
  const res = await fetch(base + '/v2/transactions');
  assert.equal(res.status, 401);
});

test('create + retrieve a Pix transaction (postTransactions / getTransactionsById)', async () => {
  const create = await call('POST', '/v2/transactions', {
    body: { amount: 1500, method: 'pix', currency: 'BRL', external_ref: 'order_t1' },
  });
  assert.equal(create.status, 201);
  assertContract('postTransactions', 201, create.body);
  assert.ok(create.body.data.pix.qr_code, 'has pix.qr_code');

  const id = create.body.data.id;
  const get = await call('GET', `/v2/transactions/${id}`);
  assert.equal(get.status, 200);
  assertContract('getTransactionsById', 200, get.body);
  assert.equal(get.body.data.id, id);
});

test('credit_card transaction returns a 3DS next_action', async () => {
  const res = await call('POST', '/v2/transactions', {
    body: { amount: 4990, method: 'credit_card', currency: 'BRL', token: 'pgct_SYNTHETIC' },
  });
  assert.equal(res.status, 201);
  assertContract('postTransactions', 201, res.body);
  assert.equal(res.body.data.status, 'three_ds_required');
  assert.equal(res.body.data.next_action.type, 'three_ds_challenge');
});

test('idempotency key returns the same transaction', async () => {
  const headers = { 'idempotency-key': 'key-abc' };
  const a = await call('POST', '/v2/transactions', { body: { amount: 100, method: 'pix' }, headers });
  const b = await call('POST', '/v2/transactions', { body: { amount: 100, method: 'pix' }, headers });
  assert.equal(a.body.data.id, b.body.data.id);
});

test('duplicate external_ref is rejected with 409', async () => {
  const body = { amount: 200, method: 'pix', external_ref: 'order_dup' };
  await call('POST', '/v2/transactions', { body });
  const dup = await call('POST', '/v2/transactions', { body });
  assert.equal(dup.status, 409);
  assertContract('postTransactions', 409, dup.body);
  assert.equal(dup.body.error, 'DUPLICATE_EXTERNAL_REF');
});

test('list transactions with cursor pagination (getTransactions)', async () => {
  const res = await call('GET', '/v2/transactions?limit=1');
  assert.equal(res.status, 200);
  assertContract('getTransactions', 200, res.body);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(typeof res.body.total, 'number');
});

test('refund a transaction (putTransactionsByIdRefund)', async () => {
  const create = await call('POST', '/v2/transactions', { body: { amount: 1000, method: 'pix' } });
  const id = create.body.data.id;
  create.body.data.paid_amount = 1000;
  const refund = await call('PUT', `/v2/transactions/${id}/refund`, { body: { amount: 400 } });
  assert.equal(refund.status, 200);
  assertContract('putTransactionsByIdRefund', 200, refund.body);
  assert.equal(refund.body.data.amount_refunded, 400);
});

test('create a checkout link (postCheckoutLinks)', async () => {
  const res = await call('POST', '/v2/checkout-links', { body: { amount: 1500, currency: 'BRL', title: 'Order' } });
  assert.equal(res.status, 201);
  assertContract('postCheckoutLinks', 201, res.body);
  assert.ok(res.body.data.url);
});

test('customer + subscription lifecycle', async () => {
  const cust = await call('POST', '/v2/customers', { body: { name: 'Buyer', email: 'b@example.com' } });
  assert.equal(cust.status, 201);
  assertContract('postCustomers', 201, cust.body);

  const sub = await call('POST', '/v2/subscriptions', {
    body: { customerId: cust.body.data.id, amount: 4990, interval: 'month' },
  });
  assert.equal(sub.status, 201);
  assertContract('postSubscriptions', 201, sub.body);

  const cancel = await call('POST', `/v2/subscriptions/${sub.body.data.id}/cancel`, { body: { reason: 'test' } });
  assert.equal(cancel.status, 200);
  assertContract('postSubscriptionsByIdCancel', 200, cancel.body);
  assert.equal(cancel.body.data.status, 'canceled');
});

test('create + cancel a transfer (postTransfers / postTransfersByIdCancel)', async () => {
  const create = await call('POST', '/v2/transfers', {
    body: { pix_key_type: 'EMAIL', pix_key_value: 'r@example.com', amount: 1200 },
  });
  assert.equal(create.status, 201);
  assertContract('postTransfers', 201, create.body);
  assert.equal(create.body.data.status, 'pending');

  const cancel = await call('POST', `/v2/transfers/${create.body.data.id}/cancel`);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.data.status, 'cancelled');
});

test('missing transfer fields yield 422', async () => {
  const res = await call('POST', '/v2/transfers', { body: { amount: 1200 } });
  assert.equal(res.status, 422);
});
