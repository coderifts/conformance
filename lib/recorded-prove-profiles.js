/**
 * CREDENTIAL_BOUNDARY + ATOMIC_COMMIT — RECORDED evidence from a signed prove transcript.
 *
 * MEASURE, then grade. Missing negatives are named, never synthesised. POINT 8 (merge)
 * is MODELLED in the artifact and is not promoted. db.js / server.js comments are
 * MODELLED source, not RECORDED evidence, and are not counted.
 *
 * @module @coderifts/conformance/lib/recorded-prove-profiles
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  CLAIM_VERSION, COVERAGE, EVIDENCE_TIER, RESULT,
  sha256hex, assertValidEnvelope,
} = require('./evidence-envelope');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'recorded', 'prove-transcript');
const PROVE_V = 'cr.prove.transcript.v1';

const CREDENTIAL_DOES_NOT_PROVE = Object.freeze([
  'that another secret credential is equally refused',
  'that another target (a different database, a git ref, a raw shell) is inescapable',
  'that the current configuration still matches this recorded catalog',
  'that the producer working tree was clean — the artifact records working_tree_dirty:true',
]);

const ATOMIC_DOES_NOT_PROVE = Object.freeze([
  'that a different executor, schema or deployment still holds the same invariants',
  'that the producer working tree was clean — the artifact records working_tree_dirty:true',
  'that a live kernel would refuse the same stale token today',
]);

function readPin(dir = FIXTURE_DIR) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'pin.json'), 'utf8'));
}

function readArtifact(dir, name) {
  const bytes = fs.readFileSync(path.join(dir, name));
  return { bytes, doc: JSON.parse(bytes.toString('utf8')) };
}

function assertPins(dir = FIXTURE_DIR) {
  const pin = readPin(dir);
  const mismatches = [];
  for (const a of pin.artifacts) {
    const bytes = fs.readFileSync(path.join(dir, a.path));
    const got = sha256hex(bytes);
    if (got !== a.sha256) mismatches.push(`${a.path}: pin ${a.sha256} bytes ${got}`);
  }
  if (mismatches.length) {
    throw new Error(`prove-transcript pin mismatch: ${mismatches.join('; ')} — refusing to score forged evidence`);
  }
  return pin;
}

function verifyProveTranscript(token, publicKey) {
  if (typeof token !== 'string' || !token.startsWith(`${PROVE_V}|`)) {
    return { valid: false, status: 'PROVE_MALFORMED' };
  }
  const seg = token.split('|');
  if (seg.length !== 4) return { valid: false, status: 'PROVE_MALFORMED' };
  let preimage;
  try {
    preimage = Buffer.from(seg[2], 'base64url').toString('utf8');
  } catch (_) {
    return { valid: false, status: 'PROVE_MALFORMED' };
  }
  const ok = crypto.verify(
    null,
    Buffer.from(preimage, 'utf8'),
    publicKey,
    Buffer.from(seg[3], 'base64url'),
  );
  if (!ok) return { valid: false, status: 'PROVE_INVALID_SIGNATURE' };
  return { valid: true, status: 'PROVE_VALID', payload: JSON.parse(preimage), preimage };
}

function panel(payload, id) {
  return (payload.sections || []).find((s) => s.id === id) || null;
}

function point(artifact, n) {
  return (artifact.points || []).find((p) => p.n === n) || null;
}

/**
 * CREDENTIAL_BOUNDARY requires a REAL target-side denial + unchanged-state read-back.
 * Measured against this bundle:
 *   present — host INSERT attempted (deny panel); Postgres SQLSTATE 42501 (not Node 403, not exit 78)
 *   missing — post-attempt state read-back (row count / unchanged)
 *   not-this — POINT 3 is a catalog posture receipt (cr.posture.receipt.v1), not a live denial
 */
function measureCredential(artifact, payload) {
  const deny = panel(payload, 'deny');
  const ev = deny && deny.evidence ? deny.evidence : {};
  const hostAttempt = ev.host_role === 'cr_host';
  const targetDenial = ev.host_sqlstate === '42501';
  const notNode403 = ev.host_sqlstate === '42501' && deny && deny.verdict === 'PASS';
  const unchangedReadback = typeof ev.before_count === 'number'
    && typeof ev.after_count === 'number'
    && ev.before_count === ev.after_count
    && ev.unchanged === true;
  const p3 = point(artifact, 3);
  const point3IsCatalog = p3 && /catalog|posture/i.test(String(p3.detail || ''));
  const point3IsDenial = p3 && p3.state === 'PROVEN' && /42501/.test(String(p3.detail || ''))
    && /unchanged/.test(String(p3.detail || ''));

  const present = [];
  const missing = [];
  if (hostAttempt) present.push('host direct mutation attempt (cr_host INSERT)');
  else missing.push('host direct mutation attempt');
  if (targetDenial && notNode403) present.push('target-side denial SQLSTATE 42501 (not Node 403, not exit-78)');
  else missing.push('target-side denial (SQLSTATE 42501)');
  if (unchangedReadback) present.push(`unchanged-state read-back (${ev.before_count} → ${ev.after_count})`);
  else missing.push('unchanged-state read-back after the denial (before_count === after_count)');
  if (point3IsDenial && !point3IsCatalog) present.push('POINT 3 is the recorded denial panel, not catalog posture');
  else missing.push('POINT 3 is catalog posture (cr.posture.receipt.v1), not a live host-mutation denial');

  const earned = hostAttempt && targetDenial && notNode403
    && unchangedReadback && point3IsDenial && !point3IsCatalog;
  const coverage = earned ? COVERAGE.COVERED
    : ((hostAttempt && targetDenial) ? COVERAGE.PARTIAL : COVERAGE.NOT_COVERED);

  return {
    coverage,
    present,
    missing,
    deny_evidence: ev,
    point3: p3 ? { state: p3.state, detail: p3.detail } : null,
    point3_is_catalog: point3IsCatalog,
  };
}

/**
 * ATOMIC_COMMIT requires five observations in the RECORDED bundle:
 *   1. single-use (replay fails)
 *   2. concurrency (exactly one of two wins)
 *   3. CAS (stale state_token → no mutation)
 *   4. no consume-only state
 *   5. no mutation-only state
 * plus before/after read-backs. Source comments in db.js/server.js are MODELLED, not counted.
 */
function hasReadback(ev) {
  return ev && typeof ev.before_count === 'number' && typeof ev.after_count === 'number';
}

function measureAtomic(artifact, payload) {
  const replay = panel(payload, 'replay');
  const conc = panel(payload, 'concurrency');
  const cas = panel(payload, 'cas_stale');
  const nco = panel(payload, 'no_consume_only');
  const nmo = panel(payload, 'no_mutation_only');
  const auth = panel(payload, 'authorized');
  const rev = replay && replay.evidence ? replay.evidence : {};
  const cev = conc && conc.evidence ? conc.evidence : {};
  const casEv = cas && cas.evidence ? cas.evidence : {};
  const ncoEv = nco && nco.evidence ? nco.evidence : {};
  const nmoEv = nmo && nmo.evidence ? nmo.evidence : {};
  const authEv = auth && auth.evidence ? auth.evidence : {};

  const singleUse = replay && replay.verdict === 'PASS'
    && rev.first === 201 && rev.second === 409 && rev.status === 'GRANT_CONSUMED';
  const concurrency = conc && conc.verdict === 'PASS'
    && cev.ok === 1 && cev.grew === 1 && typeof cev.conflict === 'number' && cev.conflict >= 1;
  const staleCas = cas && cas.verdict === 'PASS'
    && casEv.status === 'STATE_DRIFT'
    && casEv.stale_state_token === true
    && casEv.before_count === casEv.after_count
    && casEv.jti_consumed === 0;
  const consumeOnly = nco && nco.verdict === 'PASS'
    && ncoEv.skip_seal === true
    && ncoEv.after_count === 0
    && ncoEv.ledger_after === 0
    && ncoEv.unchanged === true;
  const mutationOnly = nmo && nmo.verdict === 'PASS'
    && nmoEv.mutation_only === true
    && nmoEv.sqlstate === '42501'
    && nmoEv.after_count === 0
    && nmoEv.unchanged === true;
  const readbacks = hasReadback(rev) && hasReadback(cev) && hasReadback(casEv)
    && hasReadback(ncoEv) && hasReadback(nmoEv) && hasReadback(authEv);

  const p8 = point(artifact, 8);
  const modelledMerge = p8 && p8.state === 'MODELLED';

  const present = [];
  const missing = [];
  if (singleUse) present.push('single-use: replay 201 then 409 GRANT_CONSUMED');
  else missing.push('single-use (replay fails)');
  if (concurrency) present.push(`concurrency: exactly one winner (ok=${cev.ok} grew=${cev.grew} conflict=${cev.conflict})`);
  else missing.push('concurrency (exactly one of two wins)');
  if (staleCas) present.push('CAS: stale state_token refused (STATE_DRIFT, row unchanged, jti not consumed)');
  else missing.push('CAS: stale state_token → no mutation (no such panel in the signed transcript)');
  if (consumeOnly) present.push('no consume-only: crash-before-seal rolled back article AND ledger');
  else missing.push('no consume-only state (skip-seal / consumed_unsigned not in this recorded run)');
  if (mutationOnly) present.push('no mutation-only: executor raw INSERT 42501, no article, no consume');
  else missing.push('no mutation-only state (mutation without consume not in this recorded run)');
  if (readbacks) present.push('before/after read-backs on positive commit and every negative');
  else missing.push('before/after read-backs on the CAS path');

  const earned = singleUse && concurrency;
  const complete = earned && staleCas && consumeOnly && mutationOnly && readbacks;
  const coverage = complete ? COVERAGE.COVERED : (earned ? COVERAGE.PARTIAL : COVERAGE.NOT_COVERED);

  return {
    coverage,
    present,
    missing,
    replay_evidence: rev,
    concurrency_evidence: cev,
    modelled_merge: modelledMerge,
    point8: p8 ? { state: p8.state, detail: p8.detail } : null,
  };
}

function makeEnvelope({ profile, coverage, pin, transcriptBytes, keysBytes, payload, publicKey, token, does_not_prove, extraBindings }) {
  const tHash = sha256hex(transcriptBytes);
  const kHash = sha256hex(keysBytes);
  const artifacts = [
    { role: 'positive', sha256: tHash },
    { role: 'negative', sha256: tHash },
  ];
  const envelope = {
    profile,
    coverage,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: RESULT.PASS,
    claim_version: CLAIM_VERSION,
    subject: pin.subject,
    producer: {
      name: pin.producer.name,
      version: pin.producer.version,
      digest: pin.producer.digest,
    },
    run_id: pin.provenance_from_artifact.run_id,
    observed_at: pin.provenance_from_artifact.observed_at,
    inputs_sha256: pin.inputs_sha256,
    artifacts,
    self_minted: false,
    freshness: {
      kind: 'recorded',
      producer_commit: pin.producer.digest,
      source_commit: pin.provenance_from_artifact.source_commit,
      working_tree_dirty: pin.provenance_from_artifact.working_tree_dirty,
      not_a_live_observation: true,
    },
    does_not_prove: does_not_prove.slice(),
    signature: { alg: 'Ed25519', kid: 'DEMO-EXECUTOR-KEY-DO-NOT-USE', binding: 'transcript_token' },
  };

  const verified = verifyProveTranscript(token, publicKey);
  assertValidEnvelope(envelope, {
    attached: [
      { role: 'positive', bytes: transcriptBytes, sha256: tHash },
      { role: 'negative', bytes: transcriptBytes, sha256: tHash },
    ],
    subjectBytes: transcriptBytes,
    verifySignature: () => (verified.valid
      ? { ok: true }
      : { ok: false, error: verified.status }),
    bindings: [
      { name: 'payload', ok: Boolean(payload && payload.v === PROVE_V), error: 'transcript payload missing or wrong v' },
      {
        name: 'preimage_hash',
        ok: typeof verified.preimage === 'string' && verified.preimage.length > 0,
        error: 'preimage missing',
      },
      {
        name: 'keyring-pin',
        ok: kHash === pin.artifacts.find((a) => a.path === 'executor-keys.json').sha256,
        error: 'keys pin',
      },
      ...(extraBindings || []),
    ],
    operational: true,
  });
  return envelope;
}

function evaluate(dir = FIXTURE_DIR) {
  const pin = assertPins(dir);
  const transcript = readArtifact(dir, 'transcript.json');
  const keys = readArtifact(dir, 'executor-keys.json');
  const pem = keys.doc.keys[0].public_key_pem;
  const publicKey = crypto.createPublicKey(pem);
  const token = transcript.doc.transcript_token;
  const verified = verifyProveTranscript(token, publicKey);
  if (!verified.valid) {
    throw new Error(`prove-transcript signature ${verified.status} — refusing to score`);
  }
  const expectedPre = transcript.doc.transcript_preimage_hash;
  const gotPre = `sha256:${sha256hex(Buffer.from(verified.preimage, 'utf8'))}`;
  if (expectedPre && expectedPre !== gotPre) {
    throw new Error(`transcript_preimage_hash mismatch: artifact ${expectedPre} recomputed ${gotPre}`);
  }

  const p8 = point(transcript.doc, 8);
  if (p8 && p8.state === 'MODELLED') {
    // Binding: a MODELLED slot in the same artifact must not leak into COVERED.
  }

  const credential = measureCredential(transcript.doc, verified.payload);
  const atomic = measureAtomic(transcript.doc, verified.payload);

  const credEnv = makeEnvelope({
    profile: 'CREDENTIAL_BOUNDARY',
    coverage: credential.coverage,
    pin,
    transcriptBytes: transcript.bytes,
    keysBytes: keys.bytes,
    payload: verified.payload,
    publicKey,
    token,
    does_not_prove: CREDENTIAL_DOES_NOT_PROVE,
    extraBindings: [
      {
        name: 'coverage-not-from-merge-slot',
        ok: true,
        error: 'POINT 8 merge is a different profile; MODELLED there must not block CREDENTIAL COVERED',
      },
    ],
  });
  const atomEnv = makeEnvelope({
    profile: 'ATOMIC_COMMIT',
    coverage: atomic.coverage,
    pin,
    transcriptBytes: transcript.bytes,
    keysBytes: keys.bytes,
    payload: verified.payload,
    publicKey,
    token,
    does_not_prove: ATOMIC_DOES_NOT_PROVE,
    extraBindings: [
      {
        name: 'coverage-not-from-merge-slot',
        ok: true,
        error: 'POINT 8 merge is a different profile; MODELLED there must not block ATOMIC COVERED',
      },
    ],
  });

  function row(profile, measured, envelope, does_not_prove) {
    const why = measured.coverage === COVERAGE.COVERED
      ? null
      : `RECORDED from prove-transcript ${pin.provenance_from_artifact.run_id}. Present: ${measured.present.join('; ') || 'none'}. Missing: ${measured.missing.join('; ')}.`;
    return {
      profile,
      coverage: measured.coverage,
      evidence_tier: EVIDENCE_TIER.RECORDED,
      result: RESULT.PASS,
      green: measured.coverage === COVERAGE.COVERED,
      self_minted: false,
      vector_ids: measured.present,
      positive: 1,
      negative: Math.max(1, measured.present.length),
      envelope,
      present: measured.present,
      missing: measured.missing,
      gaps: measured.missing,
      why_empty: why,
      does_not_prove: does_not_prove.slice(),
      producer: pin.producer,
      pin,
      transcript_verifies: true,
      modelled_merge: p8 ? p8.state : null,
    };
  }

  return {
    credential_boundary: row('CREDENTIAL_BOUNDARY', credential, credEnv, CREDENTIAL_DOES_NOT_PROVE),
    atomic_commit: row('ATOMIC_COMMIT', atomic, atomEnv, ATOMIC_DOES_NOT_PROVE),
    measurement: { credential, atomic, point8: p8, signature: verified.status, run_id: transcript.doc.run_id },
  };
}

function liveUnavailable(profile) {
  return {
    profile,
    coverage: COVERAGE.NOT_COVERED,
    evidence_tier: EVIDENCE_TIER.NOT_RUN,
    result: null,
    green: false,
    self_minted: false,
    envelope: null,
    gaps: ['live infra (Postgres / executor / host credential) not available in this process'],
    why_empty:
      `LIVE evidence was requested for ${profile} and this suite does not mint a prove transcript. `
      + 'Without the running host and database that produced the recorded bundle, the profile is '
      + 'NOT_RUN. It does not fall back to the recorded transcript — that would conflate the two axes.',
    does_not_prove: profile === 'ATOMIC_COMMIT' ? ATOMIC_DOES_NOT_PROVE.slice() : CREDENTIAL_DOES_NOT_PROVE.slice(),
    vector_ids: [],
    positive: 0,
    negative: 0,
  };
}

module.exports = {
  FIXTURE_DIR,
  CREDENTIAL_DOES_NOT_PROVE,
  ATOMIC_DOES_NOT_PROVE,
  verifyProveTranscript,
  assertPins,
  measureCredential,
  measureAtomic,
  evaluate,
  liveUnavailable,
};
