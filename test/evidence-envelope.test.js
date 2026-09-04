'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CLAIM_VERSION, COVERAGE, EVIDENCE_TIER,
  validateEnvelope, assertValidEnvelope, sha256hex,
} = require('../lib/evidence-envelope');

function base(over = {}) {
  const pos = Buffer.from('positive-bytes');
  const neg = Buffer.from('negative-bytes');
  return {
    envelope: {
      profile: 'RECEIPT_CRYPTO',
      coverage: COVERAGE.COVERED,
      evidence_tier: EVIDENCE_TIER.RECORDED,
      result: 'PASS',
      claim_version: CLAIM_VERSION,
      subject: { name: 'subject', version: '1', digest: `sha256:${sha256hex(pos)}` },
      producer: { name: 'producer', version: '1', digest: 'git:abc' },
      run_id: 'run-1',
      observed_at: '2026-09-04T00:00:00.000Z',
      inputs_sha256: `sha256:${sha256hex(pos)}`,
      artifacts: [
        { role: 'positive', sha256: sha256hex(pos) },
        { role: 'negative', sha256: sha256hex(neg) },
      ],
      self_minted: false,
      freshness: { kind: 'recorded' },
      does_not_prove: ['the live kernel mints this today'],
      ...over,
    },
    attached: [
      { role: 'positive', bytes: pos, sha256: sha256hex(pos) },
      { role: 'negative', bytes: neg, sha256: sha256hex(neg) },
    ],
    subjectBytes: pos,
  };
}

const sigOk = () => ({ ok: true });

describe('evidence-envelope — schema and axis discipline', () => {
  it('a complete RECORDED envelope with producer signature and matching hashes passes', () => {
    const { envelope, attached, subjectBytes } = base();
    const r = validateEnvelope(envelope, { attached, subjectBytes, verifySignature: sigOk });
    assert.equal(r.ok, true, r.errors.join('; '));
  });

  it('self_minted:true is refused — conformance never mints evidence', () => {
    const { envelope, attached } = base({ self_minted: true });
    const r = validateEnvelope(envelope, { attached, verifySignature: sigOk });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /self_minted/.test(e)));
  });

  it('MODELLED cannot be promoted to COVERED on an operational profile', () => {
    const { envelope, attached } = base({
      coverage: COVERAGE.COVERED,
      evidence_tier: EVIDENCE_TIER.MODELLED,
    });
    const r = validateEnvelope(envelope, { attached, verifySignature: sigOk, operational: true });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /MODELLED cannot be promoted/.test(e)));
  });

  it('does_not_prove must be non-empty for every RECORDED operational profile', () => {
    const { envelope, attached } = base({ does_not_prove: [] });
    const r = validateEnvelope(envelope, { attached, verifySignature: sigOk });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /does_not_prove/.test(e)));
  });

  it('COVERED without a negative artifact is refused', () => {
    const pos = Buffer.from('only-pos');
    const envelope = base({
      artifacts: [{ role: 'positive', sha256: sha256hex(pos) }],
    }).envelope;
    const r = validateEnvelope(envelope, {
      attached: [{ role: 'positive', bytes: pos, sha256: sha256hex(pos) }],
      verifySignature: sigOk,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /positive and one negative/.test(e)));
  });

  it('attached byte hash mismatch is refused', () => {
    const { envelope } = base();
    const r = validateEnvelope(envelope, {
      attached: [{ role: 'positive', bytes: Buffer.from('tampered'), sha256: envelope.artifacts[0].sha256 }],
      verifySignature: sigOk,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /sha256 mismatch/.test(e)));
  });

  it('subject.digest mismatch is refused', () => {
    const { envelope, attached } = base();
    const r = validateEnvelope(envelope, {
      attached,
      subjectBytes: Buffer.from('other-subject'),
      verifySignature: sigOk,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /subject.digest mismatch/.test(e)));
  });

  it('failed envelope signature is refused', () => {
    const { envelope, attached } = base();
    const r = validateEnvelope(envelope, {
      attached,
      verifySignature: () => ({ ok: false, error: 'bad sig' }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /signature invalid/.test(e)));
  });

  it('cross-artifact binding failure is refused', () => {
    const { envelope, attached } = base();
    const r = validateEnvelope(envelope, {
      attached,
      verifySignature: sigOk,
      bindings: [{ name: 'forged-shares-sig', ok: false, error: 'sig bytes differ' }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /forged-shares-sig/.test(e)));
  });

  it('assertValidEnvelope throws the joined errors', () => {
    assert.throws(
      () => assertValidEnvelope({ profile: 'X' }, { verifySignature: sigOk }),
      /evidence-envelope/,
    );
  });

  it('wrong claim_version is refused', () => {
    const { envelope, attached } = base({ claim_version: 'v0' });
    const r = validateEnvelope(envelope, { attached, verifySignature: sigOk });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /claim_version/.test(e)));
  });
});
