/**
 * RECEIPT_CRYPTO — RECORDED evidence from receipt-verifier's committed token vectors.
 *
 * Conformance does not mint tokens. It verifies pinned bytes produced by
 * receipt-verifier/test/gen-vectors.js (JS+Python cross-checked in that repo).
 *
 * reconstructSignedInput matches receipt-verifier/verify.js (crchain.v1). A
 * drift against the committed vectors fails this module; we do not import the
 * producer, so a future verifier rewrite cannot silently agree with itself here.
 *
 * @module @coderifts/conformance/lib/recorded-receipt-crypto
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  CLAIM_VERSION, COVERAGE, EVIDENCE_TIER, RESULT,
  sha256hex, digestOf, assertValidEnvelope,
} = require('./evidence-envelope');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'recorded', 'receipt-crypto');
const SIGNING_PREFIX = 'crchain.v1';
const MAX_SUPPORTED_V = 4;
const CLOCK_SKEW_LEEWAY_MS = 30_000;
const SIGNED_FIELDS = ['kid', 'fp', 'prev', 'caller', 'ts', 'reg', 'ir', 'expires_at', 'bh'];

const DOES_NOT_PROVE = Object.freeze([
  'that the live kernel mints this today',
  'that the production signing key is current',
  'that the key-discovery endpoint is fresh',
  'that the grant is currently executable',
]);

function readPin(dir = FIXTURE_DIR) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'pin.json'), 'utf8'));
}

function readVectors(dir = FIXTURE_DIR) {
  return {
    bytes: fs.readFileSync(path.join(dir, 'vectors.json')),
    doc: JSON.parse(fs.readFileSync(path.join(dir, 'vectors.json'), 'utf8')),
  };
}

function assertPin(dir = FIXTURE_DIR) {
  const pin = readPin(dir);
  const { bytes } = readVectors(dir);
  const got = sha256hex(bytes);
  const expected = String(pin.inputs_sha256 || '').replace(/^sha256:/, '');
  if (got !== expected) {
    throw new Error(
      `RECEIPT_CRYPTO pin mismatch: pin ${expected} bytes ${got} — refusing to score forged evidence`,
    );
  }
  return { pin, bytes, digest: `sha256:${got}` };
}

function reconstructSignedInput(payload) {
  const base = `${SIGNING_PREFIX}|${payload.kid}|${payload.fp}|${payload.prev}|${payload.caller}|${payload.ts}`;
  if (payload.v === 4) return `${base}|${payload.reg}|${payload.ir}|${payload.expires_at}|${payload.bh}`;
  if (payload.v === 3) return `${base}|${payload.reg}|${payload.ir}`;
  if (payload.v === 2) return `${base}|${payload.reg}`;
  return base;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'undefined') throw new TypeError('canonicalJson: undefined');
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported type ${t}`);
}

function isExpiredAt(expiresAtMs, nowMs) {
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) return false;
  return (expiresAtMs + CLOCK_SKEW_LEEWAY_MS) < nowMs;
}

/**
 * Thin Ed25519 verify over committed token bytes. Enough of the receipt-verifier
 * taxonomy to score the pinned vectors; not a re-implementation of the full CLI.
 */
function verifyReceipt(token, publicKey, opts = {}) {
  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, status: 'MALFORMED', reason: 'malformed_structure' };
  }
  const segments = token.split('.');
  if (segments.length !== 2 || segments.some((s) => !s)) {
    return { valid: false, status: 'MALFORMED', reason: 'malformed_structure' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, status: 'MALFORMED', reason: 'bad_json' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, status: 'MALFORMED', reason: 'bad_json' };
  }
  const expectedKid = opts.expectedKid != null ? opts.expectedKid : null;
  if (expectedKid !== null && payload.kid !== expectedKid) {
    return { valid: false, status: 'UNKNOWN_KEY', reason: 'unknown_kid', payload };
  }
  const sig = Buffer.from(segments[1], 'base64url');
  let ok = false;
  try {
    ok = crypto.verify(null, Buffer.from(reconstructSignedInput(payload), 'utf8'), publicKey, sig);
  } catch (_) {
    return { valid: false, status: 'INVALID_SIGNATURE', reason: 'signature_error', payload };
  }
  if (!ok) return { valid: false, status: 'INVALID_SIGNATURE', reason: 'signature_mismatch', payload };

  for (const k of SIGNED_FIELDS) {
    if (typeof payload[k] === 'string' && payload[k].includes('|')) {
      return { valid: false, status: 'INVALID_SIGNATURE', reason: 'delimiter_in_field', payload };
    }
  }

  if (opts.envelope && payload.v === 4) {
    const rest = { ...opts.envelope };
    delete rest.receipt;
    delete rest.decision_body_hash;
    const recomputed = `sha256:${sha256hex(canonicalJson(rest))}`;
    if (recomputed !== payload.bh) {
      return { valid: false, status: 'INVALID_SIGNATURE', reason: 'body_hash_mismatch', payload };
    }
  }

  if (typeof payload.v === 'number' && payload.v > MAX_SUPPORTED_V) {
    return { valid: false, status: 'UNSUPPORTED_VERSION', payload };
  }
  const now = opts.now != null ? opts.now : Date.now();
  if (payload.v === 4 && typeof payload.expires_at === 'string') {
    const exp = Date.parse(payload.expires_at);
    if (isExpiredAt(exp, now)) {
      return { valid: false, status: 'VERIFIED_EXPIRED', payload };
    }
  }
  return { valid: true, status: 'VERIFIED_CURRENT', payload };
}

function matchesExpected(got, expected) {
  if (typeof expected.valid === 'boolean' && got.valid !== expected.valid) return false;
  if (expected.reason && got.reason !== expected.reason) return false;
  if (expected.status && got.status !== expected.status) return false;
  return true;
}

function vectorByName(doc, name) {
  const v = doc.vectors.find((x) => x.name === name);
  if (!v) throw new Error(`RECEIPT_CRYPTO: vector ${name} missing from pinned file`);
  return v;
}

function tokenSha256(token) {
  return sha256hex(Buffer.from(token, 'utf8'));
}

function fieldLevelChecks(doc, publicKey) {
  const kid = doc.kid;
  const now = Date.parse('2026-09-04T00:00:00.000Z');
  const checks = [];

  const forged = verifyReceipt(vectorByName(doc, 'tampered_fp').token, publicKey, { expectedKid: kid });
  checks.push({
    field: 'sig',
    name: 'tampered_fp',
    ok: forged.valid === false && forged.reason === 'signature_mismatch',
    got: forged,
  });

  const key = verifyReceipt(vectorByName(doc, 'wrong_kid').token, publicKey, { expectedKid: kid });
  checks.push({
    field: 'key',
    name: 'wrong_kid',
    ok: key.valid === false && key.reason === 'unknown_kid',
    got: key,
  });

  const bind = doc.bind;
  const envOk = verifyReceipt(bind.token, publicKey, { expectedKid: kid, envelope: bind.envelope, now });
  checks.push({
    field: 'bind_ok',
    name: 'bind.expected_ok',
    ok: envOk.valid === true && envOk.status === 'VERIFIED_CURRENT',
    got: envOk,
  });

  const audienceEnv = { ...bind.envelope, environment: 'staging' };
  const audience = verifyReceipt(bind.token, publicKey, { expectedKid: kid, envelope: audienceEnv, now });
  checks.push({
    field: 'audience',
    name: 'bind.environment tamper',
    ok: audience.valid === false && audience.reason === 'body_hash_mismatch',
    got: audience,
  });

  const opEnv = { ...bind.envelope, operation: 'deploy' };
  const operation = verifyReceipt(bind.token, publicKey, { expectedKid: kid, envelope: opEnv, now });
  checks.push({
    field: 'operation',
    name: 'bind.operation tamper',
    ok: operation.valid === false && operation.reason === 'body_hash_mismatch',
    got: operation,
  });

  const expired = verifyReceipt(vectorByName(doc, 'expired_v4').token, publicKey, { expectedKid: kid, now });
  checks.push({
    field: 'expired',
    name: 'expired_v4',
    ok: expired.valid === false && expired.status === 'VERIFIED_EXPIRED',
    got: expired,
  });

  const version = verifyReceipt(vectorByName(doc, 'unsupported_v5').token, publicKey, { expectedKid: kid, now });
  checks.push({
    field: 'version',
    name: 'unsupported_v5',
    ok: version.valid === false && version.status === 'UNSUPPORTED_VERSION',
    got: version,
  });

  return checks;
}

function forgedIsByteLevel(doc) {
  const valid = vectorByName(doc, 'valid_v1');
  const forged = vectorByName(doc, 'tampered_fp');
  const vs = valid.token.split('.');
  const fs_ = forged.token.split('.');
  const sameSig = vs[1] === fs_[1];
  const differentBody = vs[0] !== fs_[0];
  // Same key/format: both two-segment tokens, same kid in the valid token's keyring.
  return { ok: sameSig && differentBody, sameSig, differentBody };
}

function evaluate(dir = FIXTURE_DIR) {
  const { pin, bytes } = assertPin(dir);
  const { doc } = readVectors(dir);
  const publicKey = crypto.createPublicKey(doc.public_key_pem);
  const now = Date.parse('2026-09-04T00:00:00.000Z');
  const kid = doc.kid;

  const vectorResults = doc.vectors.map((v) => {
    const got = verifyReceipt(v.token, publicKey, { expectedKid: kid, now });
    return {
      name: v.name,
      expected: v.expected,
      got: { valid: got.valid, reason: got.reason, status: got.status },
      ok: matchesExpected(got, v.expected),
    };
  });

  const fields = fieldLevelChecks(doc, publicKey);
  const forged = forgedIsByteLevel(doc);
  const validOk = vectorResults.filter((r) => r.expected.valid === true).every((r) => r.ok);
  const forgedRow = vectorResults.find((r) => r.name === 'tampered_fp');
  const allVectors = vectorResults.every((r) => r.ok);
  const allFields = fields.every((f) => f.ok);
  const pass = allVectors && allFields && forged.ok && validOk && forgedRow && forgedRow.ok;

  const validTok = vectorByName(doc, 'valid_v1').token;
  const forgedTok = vectorByName(doc, 'tampered_fp').token;
  const artifacts = [
    { role: 'positive', sha256: tokenSha256(validTok), name: 'valid_v1' },
    { role: 'negative', sha256: tokenSha256(forgedTok), name: 'tampered_fp' },
  ];

  const envelope = {
    profile: 'RECEIPT_CRYPTO',
    coverage: COVERAGE.COVERED,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: pass ? RESULT.PASS : RESULT.FAIL,
    claim_version: CLAIM_VERSION,
    subject: pin.subject,
    producer: {
      name: pin.producer.name,
      version: pin.producer.version,
      digest: pin.producer.digest,
    },
    run_id: `recorded:receipt-crypto:${pin.producer.artifact_commit}`,
    observed_at: '2026-07-15T00:00:00.000Z',
    inputs_sha256: pin.inputs_sha256,
    artifacts,
    self_minted: false,
    freshness: {
      kind: 'recorded',
      producer_commit: pin.producer.digest,
      artifact_commit: pin.producer.artifact_commit,
      generator: pin.producer.generator,
      not_a_live_observation: true,
    },
    does_not_prove: DOES_NOT_PROVE.slice(),
    signature: { alg: 'Ed25519', kid: doc.kid, binding: 'positive_token' },
  };

  assertValidEnvelope(envelope, {
    attached: [
      { role: 'positive', bytes: Buffer.from(validTok, 'utf8'), sha256: artifacts[0].sha256 },
      { role: 'negative', bytes: Buffer.from(forgedTok, 'utf8'), sha256: artifacts[1].sha256 },
    ],
    subjectBytes: bytes,
    verifySignature: () => {
      const r = verifyReceipt(validTok, publicKey, { expectedKid: kid, now });
      return r.valid === true
        ? { ok: true }
        : { ok: false, error: r.reason || r.status };
    },
    bindings: [
      { name: 'forged-shares-sig-with-valid', ok: forged.ok, error: 'tampered_fp must reuse valid_v1 signature bytes' },
      { name: 'file-pin', ok: sha256hex(bytes) === pin.inputs_sha256.replace(/^sha256:/, ''), error: 'vectors.json drifted from pin' },
    ],
    operational: true,
  });

  return {
    profile: 'RECEIPT_CRYPTO',
    coverage: COVERAGE.COVERED,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: envelope.result,
    green: pass,
    self_minted: false,
    envelope,
    vectors: vectorResults,
    field_level: fields,
    forged_byte_level: forged,
    pin,
    producer: pin.producer,
    does_not_prove: DOES_NOT_PROVE.slice(),
    gaps: [],
    why_empty: null,
    vector_ids: vectorResults.map((v) => v.name),
    positive: vectorResults.filter((v) => v.expected.valid === true).length,
    negative: vectorResults.filter((v) => v.expected.valid === false).length,
  };
}

function liveUnavailable() {
  return {
    profile: 'RECEIPT_CRYPTO',
    coverage: COVERAGE.NOT_COVERED,
    evidence_tier: EVIDENCE_TIER.NOT_RUN,
    result: null,
    green: false,
    self_minted: false,
    envelope: null,
    gaps: ['live kernel / production key / key-discovery not available in this process'],
    why_empty:
      'LIVE evidence was requested and this suite does not mint receipts. Without a live kernel, '
      + 'a current production key and a fresh key-discovery endpoint, RECEIPT_CRYPTO is NOT_RUN. '
      + 'It does not fall back to the recorded vectors — that would conflate the two axes.',
    does_not_prove: DOES_NOT_PROVE.slice(),
    vector_ids: [],
    positive: 0,
    negative: 0,
  };
}

module.exports = {
  FIXTURE_DIR,
  DOES_NOT_PROVE,
  reconstructSignedInput,
  canonicalJson,
  verifyReceipt,
  assertPin,
  evaluate,
  liveUnavailable,
  forgedIsByteLevel,
  fieldLevelChecks,
  digestOf,
};
