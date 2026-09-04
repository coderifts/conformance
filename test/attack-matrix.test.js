'use strict';

/**
 * Attack-matrix fixture — contract rows stay contract; executable rows are
 * run by lib/attack-matrix-runner.js. Must not populate ATOMIC_COMMIT, must
 * not enlarge adversarial.v1.json excluded[].
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AP = require('../lib/assurance-profiles');
const FIX = require('../fixtures/attack-matrix.v1.json');
const ADV = require('../fixtures/adversarial.v1.json');

const STATED = ['AM-REPLAY', 'AM-EXPIRED-NONCE', 'AM-PAYLOAD-SWAP', 'AM-MISSING-ATTESTATION'];
const PENDING = ['AM-RAW-TOOL', 'AM-CONCURRENT', 'AM-STALE-STATE'];
const EXECUTABLE = ['AM-GIT-MISSING-PIN', 'AM-HTTP-MISSING-ETAG', 'AM-RECONCILE-FORGED-ATTEST'];

describe('attack-matrix.v1.json schema — runner honors it, does not invent a verifier', () => {
  it('lives at the measured fixture path convention (fixtures/*.v1.json)', () => {
    const p = path.join(__dirname, '..', 'fixtures', 'attack-matrix.v1.json');
    assert.equal(fs.existsSync(p), true);
    assert.equal(FIX.version, 'attack-matrix.v1');
    assert.equal(FIX.runner, 'lib/attack-matrix-runner.js');
    assert.equal(FIX.status, 'running');
    assert.deepEqual(FIX.five_points, ['target', 'nonce', 'executor', 'attestation', 'gate']);
  });

  it('honesty: execute is not inventing a verifier; ATOMIC_COMMIT stays NOT_COVERED', () => {
    assert.match(FIX.honesty, /does not invent a verifier/);
    assert.match(FIX.honesty, /issueExecutionGrant/);
    assert.match(FIX.honesty, /ATOMIC_COMMIT stays NOT_COVERED/);
    assert.match(FIX.honesty, /five points/);
    assert.match(FIX.honesty, /never silently COVERED/);
  });

  it('stated/pending contract rows do not appear in VECTOR_MAP — they must not populate a profile', () => {
    assert.equal(AP.VECTOR_MAP.some((v) => /AM-REPLAY|AM-RAW-TOOL/i.test(v.vector)), false);
    assert.equal(AP.VECTOR_MAP.some((v) => v.source && v.source.includes('attack-matrix')), false);
    assert.equal(AP.ATTACK_MATRIX.populates_profile, null);
  });

  it('ATOMIC_COMMIT is not COVERED by this fixture — COVERED is the recorded transcript, not the matrix', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'ATOMIC_COMMIT');
    assert.equal(row.coverage, AP.COVERAGE.COVERED);
    assert.equal(row.evidence_tier, AP.EVIDENCE_TIER.RECORDED);
    assert.equal(AP.VECTOR_MAP.filter((v) => v.profile === 'ATOMIC_COMMIT').length, 0);
  });

  it('does not enlarge adversarial.v1.json excluded[] — still the auditor four', () => {
    const ids = ADV.excluded.map((e) => e.vector).sort();
    assert.deepEqual(ids, ['concurrent_grants', 'raw_tool_beside_guarded_table', 'ruleset_bypass', 'stale_nonce']);
  });
});

describe('stated-contract vs pending-contract — measured codes, no invented executor', () => {
  it('ten attacks: four stated, three pending, three executable', () => {
    const ids = FIX.attacks.map((a) => a.id);
    assert.deepEqual(ids.sort(), [...STATED, ...PENDING, ...EXECUTABLE].sort());
    for (const a of FIX.attacks) {
      if (STATED.includes(a.id)) {
        assert.equal(a.kind, 'stated-contract', a.id);
        assert.equal(a.execute, null, a.id);
        assert.ok(a.expected && typeof a.expected === 'object', a.id);
      } else if (PENDING.includes(a.id)) {
        assert.equal(a.kind, 'pending-contract', a.id);
        assert.equal(a.execute, null, a.id);
        assert.equal(a.expected, null, a.id);
        assert.ok(a.why_pending && a.why_pending.length > 60, a.id);
      } else {
        assert.equal(a.kind, 'executable', a.id);
        assert.equal(typeof a.execute, 'string', a.id);
        assert.ok(AP.ATTACK_MATRIX.execute_ids.includes(a.id), a.id);
      }
    }
  });

  it('replay → NONCE_ALREADY_CONSUMED, target unchanged', () => {
    const a = FIX.attacks.find((x) => x.id === 'AM-REPLAY');
    assert.equal(a.expected.outcome, 'refused');
    assert.equal(a.expected.error, 'NONCE_ALREADY_CONSUMED');
    assert.equal(a.target_unchanged, true);
    assert.equal(a.expected.demo_today_emits, 'GRANT_CONSUMED');
  });

  it('payload-swap → PAYLOAD_HASH_MISMATCH, target unchanged', () => {
    const a = FIX.attacks.find((x) => x.id === 'AM-PAYLOAD-SWAP');
    assert.equal(a.expected.outcome, 'refused');
    assert.equal(a.expected.error, 'PAYLOAD_HASH_MISMATCH');
    assert.equal(a.target_unchanged, true);
  });

  it('expired-nonce → NONCE_EXPIRED, target unchanged', () => {
    const a = FIX.attacks.find((x) => x.id === 'AM-EXPIRED-NONCE');
    assert.equal(a.expected.outcome, 'refused');
    assert.equal(a.expected.error, 'NONCE_EXPIRED');
    assert.equal(a.target_unchanged, true);
    assert.equal(a.expected.demo_today_emits, 'STATE_CHALLENGE_EXPIRED');
  });

  it('missing-attestation → authorized_and_committed false (label, not a mutation refuse)', () => {
    const a = FIX.attacks.find((x) => x.id === 'AM-MISSING-ATTESTATION');
    assert.equal(a.expected.authorized_and_committed, false);
    assert.equal(a.expected.error, null);
    assert.equal(a.target_unchanged, false);
    assert.match(a.target_unchanged_note, /LABEL/);
  });

  it('pending rows name the missing data plane rather than inventing a pass', () => {
    const raw = FIX.attacks.find((x) => x.id === 'AM-RAW-TOOL');
    const conc = FIX.attacks.find((x) => x.id === 'AM-CONCURRENT');
    const stale = FIX.attacks.find((x) => x.id === 'AM-STALE-STATE');
    assert.match(raw.why_pending, /RUNNING host/);
    assert.match(conc.why_pending, /issueExecutionGrant is undefined/);
    assert.match(stale.why_pending, /live executor/);
    assert.equal(stale.measured_future_expected.error, 'TARGET_STATE_CONFLICT');
  });
});
