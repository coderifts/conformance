'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const PP = require('../lib/recorded-prove-profiles');
const { COVERAGE, EVIDENCE_TIER } = require('../lib/evidence-envelope');

describe('prove-transcript pins and signature', () => {
  it('pin matches the vendored transcript and keyring', () => {
    const pin = PP.assertPins();
    assert.equal(
      pin.artifacts.find((a) => a.path === 'transcript.json').sha256,
      'a4f641f15995b26b238c1446d8b14c9b810207e99c30aa291e03c7ea542978d3',
    );
    assert.equal(
      pin.artifacts.find((a) => a.path === 'executor-keys.json').sha256,
      '82d7d877abf56d2a996bc69a8754866ebfac6a8f674c9182670b7f32b73b6421',
    );
  });

  it('the transcript_token verifies with the pinned executor public key', () => {
    const transcript = JSON.parse(fs.readFileSync(path.join(PP.FIXTURE_DIR, 'transcript.json'), 'utf8'));
    const keys = JSON.parse(fs.readFileSync(path.join(PP.FIXTURE_DIR, 'executor-keys.json'), 'utf8'));
    const pk = crypto.createPublicKey(keys.keys[0].public_key_pem);
    const got = PP.verifyProveTranscript(transcript.transcript_token, pk);
    assert.equal(got.valid, true, got.status);
    assert.equal(got.status, 'PROVE_VALID');
  });

  it('digest-pin mismatch errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-prove-pin-'));
    for (const f of ['transcript.json', 'executor-keys.json']) {
      fs.copyFileSync(path.join(PP.FIXTURE_DIR, f), path.join(tmp, f));
    }
    const pin = JSON.parse(fs.readFileSync(path.join(PP.FIXTURE_DIR, 'pin.json'), 'utf8'));
    pin.artifacts = pin.artifacts.map((a) => (
      a.path === 'transcript.json' ? { ...a, sha256: '0'.repeat(64) } : a
    ));
    fs.writeFileSync(path.join(tmp, 'pin.json'), JSON.stringify(pin));
    assert.throws(() => PP.assertPins(tmp), /pin mismatch/);
  });
});

describe('CREDENTIAL_BOUNDARY — measure, do not invent', () => {
  it('target-side denial is present (host INSERT → SQLSTATE 42501, not Node 403)', () => {
    const out = PP.evaluate();
    const m = out.measurement.credential;
    assert.ok(m.present.some((p) => /42501/.test(p)));
    assert.equal(m.deny_evidence.host_sqlstate, '42501');
    assert.equal(m.deny_evidence.host_role, 'cr_host');
  });

  it('POINT 3 is catalog posture, not a live denial — named, not counted as COVERED', () => {
    const out = PP.evaluate();
    assert.equal(out.measurement.credential.point3_is_catalog, true);
    assert.match(out.measurement.credential.point3.detail, /catalog|posture/i);
  });

  it('unchanged-state read-back is missing — PARTIAL / RECORDED, gap named, not fabricated', () => {
    const row = PP.evaluate().credential_boundary;
    assert.equal(row.coverage, COVERAGE.PARTIAL);
    assert.equal(row.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(row.green, false);
    assert.equal(row.self_minted, false);
    assert.ok(row.gaps.some((g) => /unchanged-state read-back/.test(g)));
    assert.ok(row.does_not_prove.length > 0);
    assert.equal(row.envelope.coverage, COVERAGE.PARTIAL);
  });
});

describe('ATOMIC_COMMIT — measure the five negatives, do not synthesise', () => {
  it('single-use (replay 201 then 409 GRANT_CONSUMED) is present', () => {
    const m = PP.evaluate().measurement.atomic;
    assert.equal(m.replay_evidence.first, 201);
    assert.equal(m.replay_evidence.second, 409);
    assert.equal(m.replay_evidence.status, 'GRANT_CONSUMED');
    assert.ok(m.present.some((p) => /single-use/.test(p)));
  });

  it('concurrency (exactly one winner) is present', () => {
    const m = PP.evaluate().measurement.atomic;
    assert.equal(m.concurrency_evidence.ok, 1);
    assert.equal(m.concurrency_evidence.grew, 1);
    assert.ok(m.concurrency_evidence.conflict >= 1);
  });

  it('stale state_token CAS, consume-only, mutation-only, read-backs are missing — PARTIAL', () => {
    const row = PP.evaluate().atomic_commit;
    assert.equal(row.coverage, COVERAGE.PARTIAL);
    assert.equal(row.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(row.green, false);
    const joined = row.gaps.join('\n');
    assert.match(joined, /stale state_token/);
    assert.match(joined, /consume-only/);
    assert.match(joined, /mutation-only/);
    assert.match(joined, /before\/after read-backs/);
  });

  it('POINT 8 merge is MODELLED and is not promoted to COVERED', () => {
    const out = PP.evaluate();
    assert.equal(out.measurement.atomic.modelled_merge, true);
    assert.equal(out.measurement.point8.state, 'MODELLED');
    assert.notEqual(out.atomic_commit.coverage, COVERAGE.COVERED);
    assert.notEqual(out.credential_boundary.coverage, COVERAGE.COVERED);
  });
});

describe('live mode does not silently fall back', () => {
  it('CREDENTIAL_BOUNDARY live without infra is NOT_RUN', () => {
    const live = PP.liveUnavailable('CREDENTIAL_BOUNDARY');
    assert.equal(live.evidence_tier, EVIDENCE_TIER.NOT_RUN);
    assert.equal(live.coverage, COVERAGE.NOT_COVERED);
    assert.match(live.why_empty, /does not fall back/);
  });
});
