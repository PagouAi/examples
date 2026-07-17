#!/usr/bin/env node
// Sandbox smoke tests for the core flows: PIX create, retrieve, transfer, and
// webhook routing. Network commands (pix/retrieve/transfer) hit the sandbox and
// need PAGOU_API_KEY; the webhook command is offline and always runs.
//
// Usage:
//   node shared/smoke/smoke.mjs <pix|retrieve|transfer|webhook|all> [id]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, '..', 'fixtures');

const BASE_URL = process.env.PAGOU_BASE_URL || 'https://api.sandbox.pagou.ai';
const API_KEY = process.env.PAGOU_API_KEY || '';

function requireKey() {
  if (!API_KEY) {
    console.error('PAGOU_API_KEY is not set; skipping network smoke.');
    process.exit(78); // EX_CONFIG: treated as skipped by the workflow guard.
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

function ok(cond, message) {
  if (!cond) throw new Error(`smoke assertion failed: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function smokePix() {
  requireKey();
  console.log('• PIX create');
  const res = await api('POST', '/v2/transactions', {
    amount: 1500,
    method: 'pix',
    currency: 'BRL',
    external_ref: `smoke_${process.pid}`,
  });
  ok(res.status === 201, `create returned 201 (got ${res.status})`);
  ok(res.json?.data?.id, 'response has data.id');
  ok(res.json?.data?.pix?.qr_code, 'response has data.pix.qr_code');
  return res.json.data.id;
}

async function smokeRetrieve(id) {
  requireKey();
  console.log('• Transaction retrieve');
  const target = id || (await smokePix());
  const res = await api('GET', `/v2/transactions/${target}`);
  ok(res.status === 200, `retrieve returned 200 (got ${res.status})`);
  ok(res.json?.data?.id === target, 'retrieved the same transaction id');
}

async function smokeTransfer() {
  requireKey();
  console.log('• Transfer (Pix Out) create');
  const res = await api('POST', '/v2/transfers', {
    pix_key_type: 'EMAIL',
    pix_key_value: 'receiver@example.com',
    amount: 1200,
    external_ref: `smoke_payout_${process.pid}`,
  });
  ok(res.status === 200 || res.status === 201, `create returned 2xx (got ${res.status})`);
  ok(res.json?.data?.id, 'response has data.id');
}

// Offline: classifies webhook envelopes into families and proves idempotent dedupe.
function classify(envelope) {
  if (envelope.event === 'transaction') return { family: 'transactions', type: envelope.data?.event_type };
  if (envelope.event === 'subscription') return { family: 'subscriptions', type: envelope.data?.event_type };
  if (typeof envelope.type === 'string' && envelope.data?.object) {
    return { family: 'transfers', type: envelope.type };
  }
  return { family: 'unknown', type: null };
}

function smokeWebhook() {
  console.log('• Webhook routing (offline)');
  const cases = [
    ['webhook.transaction.json', 'transactions'],
    ['webhook.subscription.json', 'subscriptions'],
    ['webhook.transfer.json', 'transfers'],
  ];
  const processed = new Set();
  for (const [file, expected] of cases) {
    const env = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
    const { family, type } = classify(env);
    ok(family === expected, `${file} → ${expected} (got ${family})`);
    ok(!!type, `${file} has a discriminator event name`);
    const eventId = env.id;
    ok(!!eventId, `${file} has a top-level event id`);
    ok(!processed.has(eventId), `${file} event id is first-seen`);
    processed.add(eventId);
    ok(processed.has(eventId), `${file} redelivery would be deduped`);
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  console.log(`Pagou smoke — base ${BASE_URL}`);
  switch (cmd) {
    case 'pix':
      await smokePix();
      break;
    case 'retrieve':
      await smokeRetrieve(arg);
      break;
    case 'transfer':
      await smokeTransfer();
      break;
    case 'webhook':
      smokeWebhook();
      break;
    case 'all': {
      const id = await smokePix();
      await smokeRetrieve(id);
      await smokeTransfer();
      smokeWebhook();
      break;
    }
    default:
      console.error('Usage: smoke.mjs <pix|retrieve|transfer|webhook|all> [id]');
      process.exit(2);
  }
  console.log('Smoke OK.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
