#!/usr/bin/env node
// Contract check: validates the endpoints, methods and fields the examples use
// (declared in used-operations.json) against the OpenAPI v2 snapshot. Fails
// (exit 1) on any divergence so CI blocks examples that drift from the contract.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadSpec,
  loadManifest,
  buildManifest,
  operationIndex,
  fieldExists,
  CONTRACTS_DIR,
  loadJson,
} from './lib/openapi.mjs';

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function checkManifestInSync(spec, manifest) {
  const expected = JSON.stringify(buildManifest(spec, manifest).flows);
  const actual = JSON.stringify(manifest.flows);
  if (expected !== actual) {
    err(
      'used-operations.json diverges from openapi-v2.json (operations added, removed or renamed). ' +
        'Run: node shared/contracts/tools/generate-manifest.mjs',
    );
  }
}

function checkOperations(spec, manifest) {
  const { byId, byRoute } = operationIndex(spec);
  for (const [flow, body] of Object.entries(manifest.flows || {})) {
    for (const op of body.operations || []) {
      const label = `${flow}/${op.operationId}`;
      const byIdEntry = op.operationId ? byId.get(op.operationId) : null;
      if (!byIdEntry) {
        err(`${label}: operationId not found in OpenAPI snapshot.`);
        continue;
      }
      if (byIdEntry.method !== op.method) {
        err(`${label}: method ${op.method} != contract ${byIdEntry.method}.`);
      }
      if (byIdEntry.path !== op.path) {
        err(`${label}: path ${op.path} != contract ${byIdEntry.path}.`);
      }
      if (!byRoute.has(`${op.method} ${op.path}`)) {
        err(`${label}: route ${op.method} ${op.path} not present in OpenAPI snapshot.`);
      }
      for (const field of op.fields || []) {
        if (!fieldExists(byIdEntry, field)) {
          err(`${label}: field "${field}" not found in the contract schema for this operation.`);
        }
      }
    }
  }
}

function checkWebhooks(manifest) {
  const webhooks = manifest.flows?.webhooks?.envelopes || [];
  const seen = new Set();
  for (const env of webhooks) {
    if (!env.family) err('webhooks: an envelope is missing "family".');
    if (seen.has(env.family)) err(`webhooks: duplicate envelope family "${env.family}".`);
    seen.add(env.family);
    if (!env.match || typeof env.match !== 'object') {
      err(`webhooks/${env.family}: missing "match" descriptor.`);
    }
    if (!env.discriminator) err(`webhooks/${env.family}: missing "discriminator".`);
  }
  for (const required of ['transactions', 'subscriptions', 'transfers']) {
    if (!seen.has(required)) err(`webhooks: missing required envelope family "${required}".`);
  }
}

function checkFixtures() {
  const dir = join(CONTRACTS_DIR, '..', 'fixtures');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      loadJson(join(dir, name));
    } catch (e) {
      err(`fixtures/${name}: invalid JSON (${e.message}).`);
    }
  }
}

function reportCoverage(spec, manifest) {
  const declared = new Set();
  for (const body of Object.values(manifest.flows || {})) {
    for (const op of body.operations || []) declared.add(op.operationId);
  }
  const { byId } = operationIndex(spec);
  for (const id of byId.keys()) {
    if (!declared.has(id)) warn(`OpenAPI operation "${id}" is not tracked in used-operations.json.`);
  }
  const used = [...declared].filter((id) => {
    for (const body of Object.values(manifest.flows)) {
      for (const op of body.operations || []) if (op.operationId === id && op.used) return true;
    }
    return false;
  });
  console.log(`Operations tracked: ${declared.size} | marked used: ${used.length}`);
}

function main() {
  const spec = loadSpec();
  const manifest = loadManifest();

  checkManifestInSync(spec, manifest);
  checkOperations(spec, manifest);
  checkWebhooks(manifest);
  checkFixtures();
  reportCoverage(spec, manifest);

  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    console.error(`\nContract check FAILED with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('Contract check passed.');
}

main();
