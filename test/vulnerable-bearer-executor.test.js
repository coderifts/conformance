'use strict';

/**
 * PENDING MARKER — vulnerable-bearer-executor.v1.json.
 *
 * CREDENTIAL_BOUNDARY and ATOMIC_COMMIT are why_empty. A runnable fake host / fake
 * executor would ship a green-on-vulnerable suite. This file asserts the marker
 * exists, stays pending, and does not register a subject or populate those profiles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AP = require('../lib/assurance-profiles');
const FIX = require('../fixtures/vulnerable-bearer-executor.v1.json');
const ADV = require('../fixtures/adversarial.v1.json');

const BIN = path.join(__dirname, '..', 'bin', 'coderifts-conformance.js');
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

describe('vulnerable-bearer-executor is a pending expected-fail MARKER, not a subject', () => {
  it('lives at the measured fixture path convention (fixtures/*.v1.json)', () => {
    const p = path.join(__dirname, '..', 'fixtures', 'vulnerable-bearer-executor.v1.json');
    assert.equal(fs.existsSync(p), true);
    assert.equal(FIX.version, 'vulnerable-bearer-executor.v1');
  });

  it('is pending and expected_fail — not a runnable vector', () => {
    assert.equal(FIX.status, 'pending');
    assert.equal(FIX.expected_fail, true);
    assert.equal(FIX.intended_subject.registered, false);
    assert.match(FIX.honesty, /MARKER, not a vector/);
    assert.match(FIX.honesty, /green-on-vulnerable/);
  });

  it('names the weak shape: BEARER grant, no state_nonce, no executor attestation', () => {
    assert.equal(FIX.intended_subject.grant_profile, 'BEARER');
    assert.equal(FIX.intended_subject.state_nonce, null);
    assert.equal(FIX.intended_subject.resolveStateNonce, null);
    assert.equal(FIX.intended_subject.executor_attestation, null);
    assert.equal(FIX.intended_subject.measured_residual, 'execution_grant_bearer_no_state_nonce');
  });

  it('is NOT registered as a subject — unknown, not a green fake', () => {
    const r = run(['--subject', 'vulnerable-bearer-executor']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown subject vulnerable-bearer-executor/);
  });

  it('does not appear in VECTOR_MAP — it must not populate a profile', () => {
    assert.equal(AP.VECTOR_MAP.some((v) => /vulnerable-bearer/i.test(v.vector)), false);
    assert.equal(AP.VECTOR_MAP.some((v) => v.source && v.source.includes('vulnerable-bearer')), false);
  });
});

describe('THE BITE CANNOT FIRE: both profiles stay short of COVERED (PARTIAL / RECORDED)', () => {
  it('CREDENTIAL_BOUNDARY is PARTIAL / RECORDED — 42501 present, unchanged-state read-back missing', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'CREDENTIAL_BOUNDARY');
    assert.equal(row.coverage, AP.COVERAGE.PARTIAL);
    assert.equal(row.evidence_tier, AP.EVIDENCE_TIER.RECORDED);
    assert.equal(row.green, false);
    assert.match(row.why_empty, /42501|unchanged-state|catalog/);
  });

  it('ATOMIC_COMMIT is PARTIAL / RECORDED — replay+concurrency present, CAS gaps named', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'ATOMIC_COMMIT');
    assert.equal(row.coverage, AP.COVERAGE.PARTIAL);
    assert.equal(row.evidence_tier, AP.EVIDENCE_TIER.RECORDED);
    assert.equal(row.green, false);
    assert.match(row.why_empty, /stale state_token/);
    assert.match(row.why_empty, /GRANT_CONSUMED/);
  });

  it('reference does NOT pass those profiles — --assurance exits 3, not 0', () => {
    const cred = run(['--subject', 'reference', '--assurance', 'CREDENTIAL_BOUNDARY']);
    const atom = run(['--subject', 'reference', '--assurance', 'ATOMIC_COMMIT']);
    assert.equal(cred.status, 3, cred.stdout + cred.stderr);
    assert.equal(atom.status, 3, atom.stdout + atom.stderr);
    assert.match(cred.stderr, /PARTIAL/);
    assert.match(atom.stderr, /PARTIAL/);
  });

  it('the intended bite is recorded as cannot_fire, with what is missing named', () => {
    assert.equal(FIX.intended_bite.cannot_fire, true);
    assert.ok(FIX.profiles.CREDENTIAL_BOUNDARY.what_is_missing_to_assert.length >= 3);
    assert.ok(FIX.profiles.ATOMIC_COMMIT.what_is_missing_to_assert.length >= 4);
    assert.match(FIX.profiles.CREDENTIAL_BOUNDARY.what_is_missing_to_assert.join(' '), /RUNNING host/);
    assert.match(FIX.profiles.ATOMIC_COMMIT.what_is_missing_to_assert.join(' '), /STATELESS/);
  });

  it('does not enlarge adversarial.v1.json excluded[] — that list is the auditor four', () => {
    const ids = ADV.excluded.map((e) => e.vector).sort();
    assert.deepEqual(ids, ['concurrent_grants', 'raw_tool_beside_guarded_table', 'ruleset_bypass', 'stale_nonce']);
  });
});
