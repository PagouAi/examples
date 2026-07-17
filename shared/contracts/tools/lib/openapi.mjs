import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const CONTRACTS_DIR = join(here, '..', '..');
export const OPENAPI_PATH = join(CONTRACTS_DIR, 'openapi-v2.json');
export const MANIFEST_PATH = join(CONTRACTS_DIR, 'used-operations.json');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

// Maps an OpenAPI tag to the example flow that exercises it.
const TAG_TO_FLOW = {
  Transactions: 'payments',
  'Checkout Links': 'checkout-links',
  Customers: 'subscriptions',
  Subscriptions: 'subscriptions',
  Transfers: 'transfers',
};

const FLOW_ORDER = ['payments', 'checkout-links', 'subscriptions', 'transfers'];

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadSpec(path = OPENAPI_PATH) {
  return loadJson(path);
}

export function loadManifest(path = MANIFEST_PATH) {
  return loadJson(path);
}

// Flattens the spec into a list of operations with their resolved flow.
export function listOperations(spec) {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const tag = (op.tags && op.tags[0]) || 'Untagged';
      const flow = TAG_TO_FLOW[tag] || 'other';
      ops.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        flow,
        tag,
        op,
      });
    }
  }
  return ops;
}

export function operationIndex(spec) {
  const byId = new Map();
  const byRoute = new Map();
  for (const entry of listOperations(spec)) {
    if (entry.operationId) byId.set(entry.operationId, entry);
    byRoute.set(`${entry.method} ${entry.path}`, entry);
  }
  return { byId, byRoute };
}

// Builds the canonical manifest skeleton from the spec, preserving `used`
// flags and `fields` lists carried over from a previous manifest.
export function buildManifest(spec, previous = null) {
  const prevOps = new Map();
  const prevWebhooks = new Map();
  if (previous && previous.flows) {
    for (const [flow, body] of Object.entries(previous.flows)) {
      for (const o of body.operations || []) {
        if (o.operationId) prevOps.set(o.operationId, o);
      }
      for (const e of body.envelopes || []) {
        if (e.family) prevWebhooks.set(e.family, e);
      }
    }
  }

  const grouped = new Map();
  for (const entry of listOperations(spec)) {
    if (entry.flow === 'other') continue;
    if (!grouped.has(entry.flow)) grouped.set(entry.flow, []);
    const prev = prevOps.get(entry.operationId) || {};
    const op = {
      operationId: entry.operationId,
      method: entry.method,
      path: entry.path,
      used: prev.used === true,
    };
    if (Array.isArray(prev.fields) && prev.fields.length) op.fields = prev.fields;
    grouped.get(entry.flow).push(op);
  }

  const flows = {};
  for (const flow of FLOW_ORDER) {
    if (grouped.has(flow)) flows[flow] = { operations: grouped.get(flow) };
  }
  for (const [flow, ops] of grouped) {
    if (!flows[flow]) flows[flow] = { operations: ops };
  }

  // Webhooks are inbound; there is no OpenAPI operation, so carry them through.
  const webhooks = previous?.flows?.webhooks;
  if (webhooks) flows.webhooks = webhooks;

  return {
    $schema: previous?.$schema || './used-operations.schema.json',
    description:
      previous?.description ||
      'Manifest of Pagou API v2 operations exercised by the examples. Validated against openapi-v2.json by the contract check.',
    openapi: {
      source: 'openapi-v2.json',
      title: spec.info?.title,
      version: spec.info?.version,
    },
    flows,
  };
}

// Resolves a dotted field path (e.g. "data.pix.qr_code", "buyer.document.type")
// against an operation's request or response schemas. Returns true if found.
export function fieldExists(entry, fieldPath) {
  const parts = fieldPath.split('.').filter(Boolean);
  const schemas = collectSchemas(entry.op);
  return schemas.some((schema) => walk(schema, parts));
}

function collectSchemas(op) {
  const out = [];
  const rb = op.requestBody?.content;
  if (rb) for (const c of Object.values(rb)) if (c.schema) out.push(c.schema);
  for (const resp of Object.values(op.responses || {})) {
    const content = resp.content;
    if (content) for (const c of Object.values(content)) if (c.schema) out.push(c.schema);
  }
  return out;
}

function walk(schema, parts) {
  if (!schema || typeof schema !== 'object') return false;
  if (parts.length === 0) return true;
  const candidates = expand(schema);
  const [head, ...rest] = parts;
  for (const s of candidates) {
    if (s.type === 'array' && s.items) {
      if (walk(s.items, parts)) return true;
    }
    const props = s.properties;
    if (props && Object.prototype.hasOwnProperty.call(props, head)) {
      if (walk(props[head], rest)) return true;
    }
  }
  return false;
}

// Expands allOf/anyOf/oneOf so field lookups see every branch.
function expand(schema) {
  const out = [schema];
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) out.push(...schema[key]);
  }
  return out;
}
