#!/usr/bin/env node
'use strict';

/**
 * Mint the tampered-attestation negative FROM the current positive, one decoded signature byte apart.
 *
 * ── WHAT THE OLD NEGATIVE PROVED ────────────────────────────────────────────────────────────
 *
 * MEASURED, field by field, between the shipped 0.8.10 positive and the shipped
 * tampered-attestation negative:
 *
 *   DIFFERING fields: 59 of 145
 *   samples: run_id, started_at, finished_at, provenance.source_commit, points,
 *            continuity.identities.issued_jti
 *   and it still carries: deploy, SQLSTATE, articles
 *
 * The negative is a WHOLE DIFFERENT, OLDER bundle. Refusing it proves that the old bundle is
 * refused — which was never in doubt — and says nothing about whether the flipped signature caused
 * the refusal. Fifty-nine other reasons were available.
 *
 * It had no generator, which is why: nothing could keep it tracking the positive, so it aged into a
 * historical artifact wearing a current claim's name.
 *
 * ── NO SIGNING KEY IS NEEDED, AND THAT IS WHY THIS IS NOT A LIVE-KEY STEP ───────────────────
 *
 * Minting this negative CORRUPTS a signature; it does not create one. The positive is already
 * signed, one byte of the decoded attestation signature is flipped, and the pin's digests are
 * recomputed with sha256. Nothing here holds a private key, and nothing needs to.
 *
 * ── THE MUTATION, AND WHY THE DECODED BYTE ──────────────────────────────────────────────────
 *
 * An Ed25519 signature is 64 bytes and base64url-encodes to 86 characters. 86 × 6 = 516 bits
 * against 512 real ones, so the FINAL CHARACTER carries four bits that decode to nothing: the
 * classic "flip the last character" mutation is a NO-OP for 16 of 64 possible last characters. This
 * flips a DECODED byte and asserts the bytes changed, so the mutation cannot be silently inert.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const POSITIVE = path.join(ROOT, 'fixtures', 'recorded', 'end-to-end');
const DEFAULT_OUT = path.join(ROOT, 'proof', 'negatives', 'tampered-attestation');

/** Where the executor attestation lives on a transcript. One place, named once. */
const ATTESTATION_PATH = ['target_state_transition', 'attestation'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function getIn(o, keys) { return keys.reduce((a, k) => (a == null ? a : a[k]), o); }
function setIn(o, keys, v) {
  const last = keys[keys.length - 1];
  const parent = keys.slice(0, -1).reduce((a, k) => a[k], o);
  parent[last] = v;
}

/**
 * Flip ONE bit of a token's DECODED signature, and refuse to return if that changed nothing.
 *
 * Separator-aware: two token shapes live in this ecosystem, `payload.signature` and
 * `PREFIX|KID|payload|signature`. A helper that always split on '.' would cut a pipe-joined token
 * at the dot inside its version string and rebuild everything after it as one blob — the signature
 * would change, and so would the whole token, so the case would prove "a wrecked token is refused".
 */
function flipOneSignatureByte(token) {
  const sep = token.includes('|') ? '|' : (token.includes('.') ? '.' : null);
  const i = sep === null ? -1 : token.lastIndexOf(sep);
  const sig = Buffer.from(token.slice(i + 1), 'base64url');
  if (sig.length === 0) throw new Error('the attestation has no decodable signature segment');
  const out = Buffer.from(sig);
  out[0] ^= 0x01;
  if (out.equals(sig)) throw new Error('the mutation did not change the signature bytes');
  const flipped = token.slice(0, i + 1) + out.toString('base64url');
  // STRUCTURE GUARD, counting BOTH separators rather than the one chosen above: checking only the
  // chosen one would be the check agreeing with the decision it is meant to audit.
  for (const s of ['|', '.']) {
    if (flipped.split(s).length !== token.split(s).length) {
      throw new Error(`the ${s}-segment count changed — this mangled the token instead of flipping a byte`);
    }
  }
  return { flipped, byteDiff: [...sig].filter((b, k) => b !== out[k]).length };
}

function main() {
  const argv = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out = argv[++i];
    else throw new Error(`unrecognized argument ${argv[i]}`);
  }

  // ── COPY THE POSITIVE WHOLE ───────────────────────────────────────────────────────────────
  //
  // Every file, byte for byte, so the ONLY difference is the one this script makes. Building the
  // negative from anything else is how the previous one came to differ in 59 fields.
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(POSITIVE).filter((f) => f.endsWith('.json'));
  for (const f of files) fs.copyFileSync(path.join(POSITIVE, f), path.join(out, f));

  const tPath = path.join(out, 'transcript.json');
  const t = JSON.parse(fs.readFileSync(tPath, 'utf8'));
  const token = getIn(t, ATTESTATION_PATH);
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`no attestation token at ${ATTESTATION_PATH.join('.')} — the positive's shape changed`);
  }
  const { flipped, byteDiff } = flipOneSignatureByte(token);
  setIn(t, ATTESTATION_PATH, flipped);

  // A LABEL, so the public report cannot present this as anything but what it is.
  t.negative_fixture = {
    kind: 'tampered_attestation',
    derived_from: 'fixtures/recorded/end-to-end (the current positive)',
    mutation: `one decoded byte of ${ATTESTATION_PATH.join('.')}'s Ed25519 signature`,
    decoded_signature_byte_difference: byteDiff,
    expected_result: 'REFUSED',
    expected_reason: 'INVALID_ATTESTATION_SIGNATURE',
  };
  fs.writeFileSync(tPath, `${JSON.stringify(t, null, 2)}\n`);

  // ── RE-DIGEST THE PIN ─────────────────────────────────────────────────────────────────────
  //
  // The pin covers the artifacts by sha256, so the mutated transcript must be re-hashed or the
  // bundle fails on its pin instead of on the signature — a refusal for the wrong reason is the
  // defect this whole fixture exists to avoid.
  const pinPath = path.join(out, 'pin.json');
  const pin = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
  for (const a of pin.artifacts || []) {
    const abs = path.join(out, a.path);
    if (!fs.existsSync(abs)) continue;
    const b = fs.readFileSync(abs);
    a.sha256 = sha256(b);
    a.bytes = b.length;
  }
  if (pin.subject) {
    const tb = fs.readFileSync(tPath);
    pin.subject.digest = `sha256:${sha256(tb)}`;
  }
  pin.negative_fixture = { ...t.negative_fixture };
  fs.writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);

  process.stdout.write(
    `minted ${out}\n`
    + `  derived from the current positive; ${files.length} files copied\n`
    + `  decoded_signature_byte_difference = ${byteDiff}\n`,
  );
}

if (require.main === module) main();
module.exports = { flipOneSignatureByte, ATTESTATION_PATH };
