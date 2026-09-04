'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const RC = require('../lib/recorded-receipt-crypto');
const { COVERAGE, EVIDENCE_TIER } = require('../lib/evidence-envelope');

describe('RECEIPT_CRYPTO recorded vectors — producer bytes, not minted here', () => {
  it('pin matches the vendored vectors.json sha256', () => {
    const { digest } = RC.assertPin();
    assert.equal(digest, 'sha256:b2ac4482763ad3c4d743e0073f418740f08083f37b397d6074fea3a4ccf93532');
  });

  it('evaluate is COVERED / RECORDED / PASS, self_minted false', () => {
    const out = RC.evaluate();
    assert.equal(out.coverage, COVERAGE.COVERED);
    assert.equal(out.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(out.result, 'PASS');
    assert.equal(out.self_minted, false);
    assert.equal(out.envelope.self_minted, false);
    assert.equal(out.green, true);
    assert.ok(out.does_not_prove.length >= 4);
    assert.ok(out.does_not_prove.some((d) => /live kernel mints this today/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /production signing key is current/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /key-discovery endpoint is fresh/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /grant is currently executable/.test(d)));
  });

  it('VALID tokens pass', () => {
    const out = RC.evaluate();
    const valids = out.vectors.filter((v) => v.expected.valid === true);
    assert.ok(valids.length >= 4, 'need the committed valid_v1..v4 set');
    for (const v of valids) {
      assert.equal(v.ok, true, `${v.name} should verify: ${JSON.stringify(v.got)}`);
    }
  });

  it('the forged negative is byte-level: same signature, broken protected content — not an expected:false label', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(RC.FIXTURE_DIR, 'vectors.json'), 'utf8'));
    const forged = RC.forgedIsByteLevel(doc);
    assert.equal(forged.sameSig, true, 'tampered_fp must reuse valid_v1 signature bytes');
    assert.equal(forged.differentBody, true, 'tampered_fp must change the protected body');
    assert.equal(forged.ok, true);
    const out = RC.evaluate();
    const row = out.vectors.find((v) => v.name === 'tampered_fp');
    assert.equal(row.ok, true);
    assert.equal(row.got.valid, false);
    assert.equal(row.got.reason, 'signature_mismatch');
  });

  it('field-level tampers: sig, key, audience, operation, expired, version', () => {
    const out = RC.evaluate();
    const by = Object.fromEntries(out.field_level.map((f) => [f.field, f]));
    for (const field of ['sig', 'key', 'audience', 'operation', 'expired', 'version']) {
      assert.ok(by[field], `missing field-level check ${field}`);
      assert.equal(by[field].ok, true, `${field}: ${JSON.stringify(by[field].got)}`);
    }
  });

  it('producer repo / commit / generator are pinned', () => {
    const out = RC.evaluate();
    assert.equal(out.producer.name, 'receipt-verifier');
    assert.match(out.producer.digest, /4d3cc48d36a2ee7ff256eec8d76f819843bfd429/);
    assert.equal(out.producer.generator, 'test/gen-vectors.js');
    assert.equal(out.producer.artifact_commit, '6a6ec85ca6283830377c321af4b2804bcb9b1d15');
  });

  it('digest-pin mismatch errors — does not score the drifted file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-rc-pin-'));
    fs.copyFileSync(path.join(RC.FIXTURE_DIR, 'vectors.json'), path.join(tmp, 'vectors.json'));
    const pin = JSON.parse(fs.readFileSync(path.join(RC.FIXTURE_DIR, 'pin.json'), 'utf8'));
    pin.inputs_sha256 = `sha256:${'0'.repeat(64)}`;
    fs.writeFileSync(path.join(tmp, 'pin.json'), JSON.stringify(pin));
    assert.throws(() => RC.assertPin(tmp), /pin mismatch/);
    assert.throws(() => RC.evaluate(tmp), /pin mismatch/);
  });

  it('liveUnavailable is NOT_RUN and does not fall back to recorded', () => {
    const live = RC.liveUnavailable();
    assert.equal(live.coverage, COVERAGE.NOT_COVERED);
    assert.equal(live.evidence_tier, EVIDENCE_TIER.NOT_RUN);
    assert.equal(live.envelope, null);
    assert.match(live.why_empty, /does not fall back/);
  });

  it('verifyReceipt does not mint — it only reads committed bytes', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'recorded-receipt-crypto.js'), 'utf8');
    assert.equal(/generateKeyPairSync|sign\(/.test(src), false);
    assert.equal(src.includes('createPrivateKey'), false);
  });

  it('reconstructSignedInput is the crchain.v1 prefix, matching the producer', () => {
    const s = RC.reconstructSignedInput({
      v: 1, kid: 'test-k1', fp: 'sha256:x', prev: 'null', caller: 'api', ts: 't',
    });
    assert.equal(s.startsWith('crchain.v1|'), true);
  });
});

describe('RECEIPT_CRYPTO bites the verifier itself', () => {
  it('VALID passes against the committed public key', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(RC.FIXTURE_DIR, 'vectors.json'), 'utf8'));
    const pk = crypto.createPublicKey(doc.public_key_pem);
    const valid = doc.vectors.find((v) => v.name === 'valid_v1');
    const got = RC.verifyReceipt(valid.token, pk, { expectedKid: doc.kid });
    assert.equal(got.valid, true, JSON.stringify(got));
  });

  it('forged fails against the same key', () => {
    const doc = JSON.parse(fs.readFileSync(path.join(RC.FIXTURE_DIR, 'vectors.json'), 'utf8'));
    const pk = crypto.createPublicKey(doc.public_key_pem);
    const forged = doc.vectors.find((v) => v.name === 'tampered_fp');
    const got = RC.verifyReceipt(forged.token, pk, { expectedKid: doc.kid });
    assert.equal(got.valid, false);
    assert.equal(got.reason, 'signature_mismatch');
  });
});
