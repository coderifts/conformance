'use strict';
/**
 * 1567 — A SUBJECT DOCUMENTED AS DEPENDENCY-FREE MUST RUN WITHOUT THE DEPENDENCIES.
 *
 * README.md's subject table says `reference | ... | Deps: none`. On the published 0.8.10 that was
 * false, and it was false for a reason no reader could have guessed: bin/coderifts-conformance.js
 * required all four subject modules at the top of the file to build the SUBJECTS table, so asking
 * for `reference` loaded `subjects/sdk-read-decision.js`, which requires `@coderifts/sdk`.
 *
 * MEASURED, extracted tarball, no node_modules beside it:
 *   node bin/coderifts-conformance.js --subject reference
 *   -> Error: Cannot find module '@coderifts/sdk'
 * Every subject failed the same way, and so did `--assurance END_TO_END` — the command VERIFY.md
 * hands to a stranger.
 *
 * WHY THE TEST IS SHAPED LIKE THIS. Installing the package resolves its dependencies, so any test
 * that runs inside this repo — or inside a normal `npm install` of the tarball — cannot see the
 * defect. It only appears where dependency resolution cannot reach upward. So the test COPIES the
 * runtime into a scratch directory outside this tree and runs it there with an empty NODE_PATH.
 * A test that could not have failed before the fix would be worth nothing here.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
/** The runtime a consumer gets, minus anything npm would have installed alongside it. */
const SHIPPED = ['bin', 'lib', 'subjects', 'fixtures', 'cases.v1.json', 'package.json'];

function isolatedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-1567-'));
  for (const entry of SHIPPED) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true });
  }
  // Assert the isolation itself. If a node_modules ever rides along, the test would pass for the
  // wrong reason and keep passing after a regression.
  assert.ok(!fs.existsSync(path.join(dir, 'node_modules')), 'the scratch copy must have no node_modules');
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, [path.join(dir, 'bin', 'coderifts-conformance.js'), ...args], {
    encoding: 'utf8', cwd: dir, env: { ...process.env, NODE_PATH: '' },
  });
}

test('1567 — `--subject reference` runs with no dependencies resolvable', () => {
  const dir = isolatedCopy();
  try {
    const r = run(dir, ['--subject', 'reference']);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /Cannot find module/, 'no module may be loaded that this subject does not use');
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /reference profile=normative: \d+ passed, 0 failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('1567 — the VERIFY.md command runs with no dependencies resolvable', () => {
  // This is the one a stranger actually types. It reads the embedded fixture and needs neither
  // the SDK nor the guard.
  const dir = isolatedCopy();
  try {
    const r = run(dir, ['--assurance', 'END_TO_END']);
    assert.doesNotMatch(`${r.stdout}${r.stderr}`, /Cannot find module/);
    assert.match(r.stdout, /END_TO_END: COVERED/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('1567 — a subject that DOES need a dependency still reports the missing one, and names itself', () => {
  // The fix must not turn a missing dependency into a quiet pass. `sdk` genuinely needs
  // @coderifts/sdk, so it must still fail — just at the point of asking for it, naming the
  // subject module in the require stack rather than failing before the flags are even read.
  const dir = isolatedCopy();
  try {
    const r = run(dir, ['--subject', 'sdk']);
    assert.notEqual(r.status, 0);
    const out = `${r.stdout}${r.stderr}`;
    assert.match(out, /Cannot find module '@coderifts\/sdk'/);
    assert.match(out, /subjects[/\\]sdk-read-decision\.js/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
