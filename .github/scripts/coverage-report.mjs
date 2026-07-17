#!/usr/bin/env node
// Aggregates each language dir's coverage.json into a flow x language matrix and
// writes it to $GITHUB_STEP_SUMMARY (when set) and stdout. Missing coverage.json
// files are reported as "planned". Never fails the build on coverage alone.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const LANGUAGES = ['typescript', 'python', 'php', 'java', 'dotnet', 'go', 'ruby'];
const FLOWS = ['payments', 'checkout-links', 'subscriptions', 'transfers', 'webhooks'];
const ICON = {
  complete: '✅',
  partial: '🟡',
  planned: '⬜',
  'not-applicable': '➖',
};

function detectLanguages() {
  const found = new Set(LANGUAGES);
  for (const name of readdirSync(ROOT)) {
    const full = join(ROOT, name);
    if (LANGUAGES.includes(name)) continue;
    try {
      if (statSync(full).isDirectory() && existsSync(join(full, 'coverage.json'))) found.add(name);
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

function loadCoverage(lang) {
  const path = join(ROOT, lang, 'coverage.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn(`warning: ${lang}/coverage.json is invalid JSON (${e.message})`);
    return null;
  }
}

function stateFor(coverage, flow) {
  if (!coverage) return 'planned';
  const flows = coverage.flows || {};
  return flows[flow] || 'planned';
}

function render() {
  const langs = detectLanguages();
  const header = `| Language | ${FLOWS.join(' | ')} |`;
  const sep = `| --- | ${FLOWS.map(() => '---').join(' | ')} |`;
  const rows = [];
  const totals = { complete: 0, partial: 0, planned: 0, 'not-applicable': 0 };

  for (const lang of langs) {
    const coverage = loadCoverage(lang);
    const cells = FLOWS.map((flow) => {
      const state = stateFor(coverage, flow);
      if (totals[state] !== undefined) totals[state] += 1;
      return `${ICON[state] || '⬜'} ${state}`;
    });
    rows.push(`| \`${lang}\` | ${cells.join(' | ')} |`);
  }

  const legend = Object.entries(ICON)
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');

  return [
    '# Coverage matrix',
    '',
    `Legend: ${legend}`,
    '',
    header,
    sep,
    ...rows,
    '',
    `Totals — complete: ${totals.complete}, partial: ${totals.partial}, planned: ${totals.planned}, n/a: ${totals['not-applicable']}`,
    '',
  ].join('\n');
}

const report = render();
console.log(report);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) writeFileSync(summary, report + '\n', { flag: 'a' });

const out = process.env.COVERAGE_REPORT_PATH;
if (out) writeFileSync(out, report + '\n');
