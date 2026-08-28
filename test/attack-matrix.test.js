'use strict';

/**
 * Attack-matrix CONTRACT fixture — recorded expectations, not a running executor.
 *
 * Must not populate ATOMIC_COMMIT, must not enlarge adversarial.v1.json excluded[],
 * must not register a subject. A green check here is a JSON-shape check, not a
 * consumed nonce.
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

describe('attack-matrix.v1.json is a CONTRACT fixture, not a runner', () => {
  it('lives at the measured fixture path convention (fixtures/*.v1.json)', () => {
    const p = path.join(__dirname, '..', 'fixtures', 'attack-matrix.v1.json');
    assert.equal(fs.existsSync(p), true);
    assert.equal(FIX.version, 'attack-matrix.v1');
    assert.equal(FIX.runner, 'none');
    assert.equal(FIX.status, 'contract');
  });

  it('honesty: contract for a future executor, not proof the suite runs the attacks', () => {
    assert.match(FIX.honesty, /CONTRACT expectations for a future credential-owning executor/);
    assert.match(FIX.honesty, /not proof this suite runs the attacks/);
    assert.match(FIX.honesty, /Do not invent a verifier/);
    assert.match(FIX.honesty, /no issueExecutionGrant/);
    assert.match(FIX.honesty, /ATOMIC_COMMIT stays NOT_COVERED/);
  });

  it('does not appear in VECTOR_MAP — it must not populate a profile', () => {
    assert.equal(AP.VECTOR_MAP.some((v) => /attack-matrix|AM-REPLAY|AM-RAW-TOOL/i.test(v.vector)), false);
    assert.equal(AP.VECTOR_MAP.some((v) => v.source && v.source.includes('attack-matrix')), false);
  });

  it('ATOMIC_COMMIT stays NOT_COVERED', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'ATOMIC_COMMIT');
    assert.equal(row.status, AP.STATUS.NOT_COVERED);
    assert.equal(row.green, false);
    assert.equal(row.vectors, 0);
  });

  it('does not enlarge adversarial.v1.json excluded[] — still the auditor four', () => {
    const ids = ADV.excluded.map((e) => e.vector).sort();
    assert.deepEqual(ids, ['concurrent_grants', 'raw_tool_beside_guarded_table', 'ruleset_bypass', 'stale_nonce']);
  });
});

describe('stated-contract vs pending-contract — measured codes, no invented executor', () => {
  it('seven attacks: four stated, three pending', () => {
    const ids = FIX.attacks.map((a) => a.id);
    assert.deepEqual(ids.sort(), [...STATED, ...PENDING].sort());
    for (const a of FIX.attacks) {
      if (STATED.includes(a.id)) {
        assert.equal(a.kind, 'stated-contract', a.id);
        assert.ok(a.expected && typeof a.expected === 'object', a.id);
      } else {
        assert.equal(a.kind, 'pending-contract', a.id);
        assert.equal(a.expected, null, a.id);
        assert.ok(a.why_pending && a.why_pending.length > 60, a.id);
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
