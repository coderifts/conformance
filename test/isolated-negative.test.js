'use strict';

/**
 * The tampered-attestation negative must differ from the positive by ONE decoded signature byte.
 *
 * ── WHAT THE OLD NEGATIVE PROVED ────────────────────────────────────────────────────────────
 *
 * MEASURED between the shipped 0.8.10 positive and the shipped negative, field by field:
 *
 *   DIFFERING fields: 59 of 145
 *   samples: run_id, started_at, finished_at, provenance.source_commit, points,
 *            continuity.identities.issued_jti
 *   still carrying: deploy, SQLSTATE, articles
 *
 * Both bundles are refused with `ATTEST_INVALID_SIGNATURE: signature_mismatch`, so the old fixture
 * looked like it was doing its job. It was not: it is a whole different, older bundle, and
 * fifty-nine other reasons to refuse were available. "The old bundle is refused" was never in
 * doubt; whether the flipped signature CAUSED the refusal is what a negative control is for.
 *
 * A one-byte negative makes the refusal attributable — there is nothing else it could be.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');
const { flipOneSignatureByte, ATTESTATION_PATH } = require('../scripts/mint-tampered-attestation-negative.js');

const ROOT = path.join(__dirname, '..');
const POS = path.join(ROOT, 'fixtures', 'recorded', 'end-to-end');
const NEG = path.join(ROOT, 'proof', 'negatives', 'tampered-attestation');

const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

/** Flatten to leaf paths so "which fields differ" is a countable question, not an impression. */
function flat(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const q = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, q, out);
    else out[q] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
}

/**
 * Fields that MAY differ, each because the negative is a distinct artifact rather than because the
 * mutation touched them.
 *
 * A whitelist, not a threshold: "fewer than N differences" would let the next drift in quietly. The
 * attestation itself is the mutation; the pin digests and the label describe the file, and every
 * one of them is DERIVED from the mutation rather than an independent change.
 */
const DERIVED_OR_LABEL = [
  ATTESTATION_PATH.join('.'),          // the mutation itself
  /^negative_fixture\./,               // the label saying what this file is
  /^artifacts\.\d+\.(sha256|bytes)$/,  // pin digests, recomputed over the mutated bytes
  /^subject\.digest$/,
];
const allowed = (key) => DERIVED_OR_LABEL.some((p) => (p instanceof RegExp ? p.test(key) : p === key));

describe('the tampered-attestation negative is ONE byte from the positive', () => {
  it('the fixture exists and carries its own label', () => {
    const t = read(NEG, 'transcript.json');
    assert.ok(t.negative_fixture, 'the negative carries no negative_fixture label — a reader cannot '
      + 'tell a deliberately-corrupted bundle from a broken one');
    assert.equal(t.negative_fixture.kind, 'tampered_attestation');
    assert.equal(t.negative_fixture.expected_result, 'REFUSED');
    assert.equal(t.negative_fixture.expected_reason, 'INVALID_ATTESTATION_SIGNATURE');
  });

  it('decoded_signature_byte_difference === 1', () => {
    const t = read(NEG, 'transcript.json');
    assert.equal(t.negative_fixture.decoded_signature_byte_difference, 1,
      'the label claims a different byte count than one');
    // Measured, not trusted: decode both signatures and count.
    const posTok = ATTESTATION_PATH.reduce((a, k) => a[k], read(POS, 'transcript.json'));
    const negTok = ATTESTATION_PATH.reduce((a, k) => a[k], t);
    const sigOf = (tok) => {
      const sep = tok.includes('|') ? '|' : '.';
      return Buffer.from(tok.slice(tok.lastIndexOf(sep) + 1), 'base64url');
    };
    const a = sigOf(posTok);
    const b = sigOf(negTok);
    assert.equal(a.length, b.length, 'the signature length changed — the token was mangled, not flipped');
    const diff = [...a].filter((x, i) => x !== b[i]).length;
    assert.equal(diff, 1, `${diff} decoded signature bytes differ, expected exactly 1`);
  });

  it('all_non_derived_semantic_fields_equal === true', () => {
    const p = flat(read(POS, 'transcript.json'));
    const n = flat(read(NEG, 'transcript.json'));
    const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
    const unexpected = [...keys].filter((k) => p[k] !== n[k] && !allowed(k));
    assert.deepEqual(unexpected, [],
      `${unexpected.length} field(s) differ beyond the mutation and its derived values — the negative `
      + `is a different bundle, not a one-byte mutation of this one: ${unexpected.slice(0, 8).join(', ')}`);
  });

  it('and it carries none of the retired terminology', () => {
    // The old fixture shipped `deploy`, `SQLSTATE` and `articles` in a public proof directory, so
    // the report presented a superseded vocabulary as a current claim.
    const text = fs.readFileSync(path.join(NEG, 'transcript.json'), 'utf8');
    for (const word of ['SQLSTATE', 'articles', 'contract-publish', 'postgres://', 'postgresql://']) {
      assert.equal(text.includes(word), false, `the negative still carries "${word}"`);
    }
  });

  it('result === REFUSED, reason === INVALID_ATTESTATION_SIGNATURE', () => {
    const m = measureContractE2E({ dir: NEG });
    assert.notEqual(m.coverage, 'COVERED', 'the tampered bundle was accepted');
    const why = (m.missing || []).join(' | ');
    assert.match(why, /executor attestation does not verify/);
    assert.match(why, /ATTEST_INVALID_SIGNATURE/);
  });

  it('the flip helper refuses a no-op mutation', () => {
    // An Ed25519 signature is 64 bytes in 86 base64url characters, so the last character carries
    // four bits that decode to nothing: "flip the last character" is inert for 16 of 64. This
    // helper flips a DECODED byte and asserts the bytes moved.
    const { byteDiff } = flipOneSignatureByte('a.aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(byteDiff, 1);
    // An EMPTY signature segment has nothing to flip, and that is the case that must throw.
    // MEASURED: the first version of this assertion passed a separator-less string, expecting a
    // throw — but a token with no separator is ALL signature by design, so it flipped fine. The
    // helper was right and the test's example was wrong.
    assert.throws(() => flipOneSignatureByte('a.'), /no decodable signature segment/);
    // A pipe-joined token keeps its segment count — the mangling guard, exercised.
    const piped = flipOneSignatureByte('cr.exec.attest.v1|kid|body|aaaaaaaaaaaaaaaa');
    assert.equal(piped.flipped.split('|').length, 4);
    assert.equal(piped.flipped.split('.').length, 4);
  });
});

/**
 * 1552 — the two-grant fixture is HISTORICAL, and must say so.
 *
 * It is kept deliberately: it records a real refusal from an earlier mechanism. What it must not do
 * is appear in a public report as a CURRENT claim, because its vocabulary was retired.
 */
describe('the two-grant negative is labelled historical', () => {
  const TWO = path.join(ROOT, 'proof', 'negatives', 'two-grant');

  it('carries historical_fixture: true and a terminology_version — IN THE PIN', () => {
    // The label belongs to the pin, not the transcript. MEASURED: adding it to transcript.json
    // changed the bytes the pin covers and broke the fixture outright —
    // "transcript.json does not match its pin: b0c3601b0418 != 75f1b6a072df". A recorded capture is
    // not the place for the repository's later annotations about that capture.
    const t = JSON.parse(fs.readFileSync(path.join(TWO, 'pin.json'), 'utf8'));
    assert.equal(t.historical_fixture, true,
      'the two-grant fixture is not labelled historical — its retired vocabulary reads as current');
    assert.ok(t.terminology_version,
      'no terminology_version — a reader cannot tell which vocabulary this fixture speaks');
    // And the recorded run is untouched: a historical capture that was edited is not the capture.
    const tx = fs.readFileSync(path.join(TWO, 'transcript.json'), 'utf8');
    assert.equal(/"historical_fixture"/.test(tx), false,
      'the label leaked into the recorded transcript — that edits the run it claims to describe');
  });
});
