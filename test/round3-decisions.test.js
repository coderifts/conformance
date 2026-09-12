'use strict';
/**
 * The three decisions taken on 2026-09-12, pinned so none of them regresses quietly.
 *
 * 1626  the capability-demo git dependency is gone
 * 1560  the output names the measure that produced it
 * 1629  a failed correlation names the term that failed, and the gap behind it
 *
 * All three are additive or subtractive at the edges; none moves a grade. The point of pinning
 * them is that each replaced something that LOOKED fine: an install that quietly reached
 * github.com, a report that could not say which release wrote it, and a refusal whose stated
 * reason and whose actual reason were different sentences.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'coderifts-conformance.js');
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: ROOT });

test('1626 — capability-demo is not an npm dependency of any kind', () => {
  const pkg = require('../package.json');
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    const deps = pkg[field] || {};
    assert.ok(!deps['capability-demo'], `${field} must not carry capability-demo`);
  }
  // The DESCRIPTOR stays. lib/attack-matrix-runner.js resolves the sibling checkout through it
  // and names the commit when the checkout is absent; dropping it would turn a named absence
  // into an anonymous one, which is the opposite of the intent.
  const pin = pkg.coderifts.capability_demo;
  assert.equal(pin.sibling, '../capability-demo');
  assert.match(pin.commit, /^[0-9a-f]{40}$/);
});

test('1560 — every output mode names the measure', () => {
  const self = `@coderifts/conformance@${require('../package.json').version}`;

  const subject = run('--subject', 'reference');
  assert.equal(subject.status, 0, subject.stdout + subject.stderr);
  assert.match(subject.stdout, new RegExp(`measured_by: ${self.replace(/[/@.]/g, '\\$&')}`));

  const assurance = run('--assurance', 'END_TO_END');
  assert.match(assurance.stdout, /measured_by: @coderifts\/conformance@/);

  const asJson = run('--assurance', 'END_TO_END', '--json');
  assert.equal(JSON.parse(asJson.stdout).measured_by, self);

  // The schema version is a DIFFERENT fact and must not be confused with the package version.
  // If these ever collapse into one field, a reader loses the ability to tell "which release
  // measured this" from "which envelope shape is this".
  assert.notEqual(JSON.parse(asJson.stdout).schema, self);
});

test('1629 — a refused capture names the failing term and the gap behind it', () => {
  const r = run('--dir', path.join(ROOT, 'proof', 'negatives', 'tampered-attestation'), '--assurance', 'END_TO_END');
  const out = r.stdout + r.stderr;
  assert.match(out, /PARTIAL/);
  // MEASURED: the failing term is no_transition_gaps, not signature_valid — the flipped byte is
  // caught inside the transition checks, ahead of the term whose name contains "signature". The
  // assertion pins what actually happens, not what the term names suggested.
  assert.match(out, /failed: no_transition_gaps/);
  // And the gap rides along, so the one line says which byte to look at.
  assert.match(out, /ATTEST_INVALID_SIGNATURE/);
  // The fixture's own stated expectation and the tool's stated reason now meet.
  const fixture = require('../proof/negatives/tampered-attestation/transcript.json');
  assert.equal(fixture.negative_fixture.expected_reason, 'INVALID_ATTESTATION_SIGNATURE');
  assert.equal(fixture.negative_fixture.decoded_signature_byte_difference, 1);
});

test('1629 — a clean capture still reports no failing terms', () => {
  // The bite: if the term list were wired wrong (say, a term inverted), the positive would start
  // printing failures while still grading COVERED. Grade and explanation must agree.
  const r = run('--dir', path.join(ROOT, 'fixtures', 'recorded', 'end-to-end'), '--assurance', 'END_TO_END');
  assert.match(r.stdout, /END_TO_END: COVERED/);
  assert.doesNotMatch(r.stdout + r.stderr, /is not correlated/);
});
