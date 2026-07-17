#!/usr/bin/env node
// Regenerates used-operations.json from the OpenAPI snapshot, preserving
// `used` flags and `fields` lists. Run with --check to fail (exit 1) when the
// checked-in manifest is stale instead of rewriting it.
import { writeFileSync, existsSync } from 'node:fs';
import { loadSpec, loadManifest, buildManifest, MANIFEST_PATH } from './lib/openapi.mjs';

function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const spec = loadSpec();
  const previous = existsSync(MANIFEST_PATH) ? loadManifest() : null;
  const next = serialize(buildManifest(spec, previous));

  if (check) {
    const current = previous ? serialize(previous) : '';
    if (current !== next) {
      console.error('used-operations.json is out of sync with openapi-v2.json.');
      console.error('Run: node shared/contracts/tools/generate-manifest.mjs');
      process.exit(1);
    }
    console.log('used-operations.json is in sync with the OpenAPI snapshot.');
    return;
  }

  writeFileSync(MANIFEST_PATH, next);
  console.log(`Wrote ${MANIFEST_PATH}`);
}

main();
