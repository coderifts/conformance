'use strict';

/**
 * END_TO_END over the demo's SINGLE correlated contract-publish run.
 *
 * ── WHY THIS IS A NEW PATH AND NOT A REPAIR OF THE OLD ONE ──────────────────────────────────
 *
 * `recorded-provider-enforced.js measureEndToEnd()` correlates the Postgres prove-transcript with
 * the GitHub provider-capture. MEASURED, repeatedly: those are two separate runs with no shared
 * run_id and no shared commit, so it is a collage — and it correctly stays PARTIAL. No amount of
 * re-vendoring fixes that, because nothing can make two runs into one after the fact.
 *
 * This module reads a DIFFERENT artifact: one run of the demo's contract-publish chain, in which
 * the governed object is the contract, the readback names the commit that contract belongs to, and
 * a signed correlation binds them. One run_id, one commit, one signature.
 *
 * ── WHAT IS CHECKED, AND WHY NOT A PINNED HASH ──────────────────────────────────────────────
 *
 * The pin makes the bytes tamper-evident; it says nothing about whether the correlation MEANS
 * anything. So the measure rebuilds the signed preimage from the artifact's own fields and checks
 * the signature against the vendored keyring. A recorded hash nobody recomputes is decoration —
 * the same rule this repo applies to every other recorded profile.
 *
 * ── EVIDENCE TIER ───────────────────────────────────────────────────────────────────────────
 *
 * RECORDED, not LIVE. Conformance replays a pinned capture; it does not stand up Postgres and
 * re-run the demo. Calling that LIVE would be the one word in this file that is not measured.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { COVERAGE, EVIDENCE_TIER, RESULT } = require('./assurance-profiles');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'recorded', 'end-to-end');
const CORRELATION_V = 'cr.exec.correlation.v1';

/**
 * Clock skew allowed between a provider witness and the run it describes.
 *
 * MEASURED 2026-09-06 on the vendored capture: readback.observed_at is 2026-09-12, SIX DAYS AFTER
 * the run finished (2026-09-05T21:57Z) — a witness observing a future, and nothing refused it. An
 * observation that postdates the thing it observes is not late evidence, it is evidence of a
 * different event. Five minutes covers real clock drift between a CI runner and a laptop; six days
 * is not drift.
 */
const WITNESS_SKEW_MS = 5 * 60 * 1000;
/** Unit separator — must match demo/src/contract-correlation.js byte for byte. */
const US = String.fromCharCode(0x1f);

/**
 * The ceiling, carried on every result. None of it is softened by the signature, and the last
 * line exists because "7/7" is the number most likely to be quoted without the sentence after it.
 */
const E2E_CONTRACT_DOES_NOT_PROVE = Object.freeze([
  'that CodeRifts merged anything — no pull request was merged under this grant. That is PATH B, a '
  + 'different claim requiring CodeRifts to be the merge actor, and this profile is not evidence for it',
  'that the provider did what the readback says — the readback is an UNSIGNED document, a witness '
  + 'observation graded by a public grader, never a statement GitHub signed',
  'that the provider\'s copy of the contract matches the governed bytes — the correlation binds the '
  + 'commit id, not a re-read of the file at the provider',
  'that this run happened today — the capture is pinned and replayed; freshness is HISTORICAL',
  'THE MISREAD THIS PROFILE REFUSES: "7/7" does not mean CodeRifts merges the PR. It means the '
  + 'contract-publish chain is correlated end to end in one run',
]);

function readJson(name) {
  const bytes = fs.readFileSync(path.join(FIXTURE_DIR, name));
  return { bytes, doc: JSON.parse(bytes.toString('utf8')) };
}

const sha256hex = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/** Rebuilt from the artifact's own fields — never read back from `correlation_hash`. */
function correlationPreimage(c) {
  return [CORRELATION_V, c.scope_hash, c.contract_commit, c.contract_path, c.readback_commit].join(US);
}

/**
 * Every artifact is checked against the pin BEFORE it is read as evidence. A fixture that does not
 * match its own pin is not weaker evidence, it is unknown bytes.
 */
function assertPins() {
  const { doc: pin } = readJson('pin.json');
  for (const a of pin.artifacts) {
    const abs = path.join(FIXTURE_DIR, a.path);
    // A missing artifact is reported by the measure as a gap; the pin check only speaks about
    // bytes it can see. Conflating "absent" with "tampered" would name the wrong problem.
    if (!fs.existsSync(abs)) continue;
    const bytes = fs.readFileSync(abs);
    const got = crypto.createHash('sha256').update(bytes).digest('hex');
    if (got !== a.sha256) {
      throw new Error(`END_TO_END fixture ${a.path} does not match its pin: `
        + `${got.slice(0, 12)} != ${a.sha256.slice(0, 12)}`);
    }
  }
  return pin;
}

function measureContractE2E() {
  const pin = assertPins();
  const { doc: artifact } = readJson('transcript.json');
  const { doc: keyring } = readJson('executor-keys.json');
  const { doc: readback } = readJson('readback.json');

  const present = [];
  const missing = [];

  const c = artifact.correlation || null;
  const points = Array.isArray(artifact.points) ? artifact.points : [];
  const p8 = points.find((p) => p.n === 8) || null;

  // 1 — the run is one run.
  const oneRun = typeof artifact.run_id === 'string' && artifact.run_id.length > 0;
  if (oneRun) present.push(`one run_id across ${points.length} points: ${artifact.run_id}`);
  else missing.push('the artifact carries no run_id');

  // 2 — POINT 8 is PROVEN IN THIS RUN (not in some other transcript).
  const mergeProven = !!p8 && p8.state === 'PROVEN';
  if (mergeProven) present.push('POINT 8 merge is PROVEN in this run');
  else missing.push(`POINT 8 merge is ${p8 ? p8.state : 'absent'} — not a correlated merge`);

  // 3 — the correlation exists as FIELDS, not prose.
  const fields = ['scope_hash', 'contract_commit', 'contract_path', 'readback_commit',
    'correlation_hash', 'signature'];
  const hasFields = !!c && c.v === CORRELATION_V && fields.every((f) => typeof c[f] === 'string' && c[f]);
  if (hasFields) present.push(`correlation ${CORRELATION_V} present as fields`);
  else missing.push('the artifact carries no structured correlation (prose is not a binding)');

  // 4 — the readback names the commit the governed contract belongs to.
  const commitsAgree = hasFields
    && c.contract_commit === c.readback_commit
    && readback.commit === c.contract_commit;
  if (commitsAgree) present.push(`readback.commit === contract_commit (${c.contract_commit.slice(0, 12)})`);
  else missing.push('readback.commit does not equal the governed contract commit');

  // 5 — and the binding is SIGNED. Rebuilt, re-hashed, re-verified.
  let signatureValid = false;
  let signatureReason = 'not attempted';
  if (hasFields) {
    const preimage = correlationPreimage(c);
    if (`sha256:${sha256hex(preimage)}` !== c.correlation_hash) {
      signatureReason = 'correlation_hash does not match the rebuilt preimage';
    } else {
      try {
        const pub = crypto.createPublicKey(keyring.keys[0].public_key_pem);
        signatureValid = crypto.verify(null, Buffer.from(preimage, 'utf8'), pub,
          Buffer.from(c.signature, 'base64url'));
        signatureReason = signatureValid ? null : 'signature does not verify against the vendored keyring';
      } catch (err) { signatureReason = `signature check threw: ${(err && err.message) || 'error'}`; }
    }
  }
  if (signatureValid) present.push('the correlation signature re-verifies from the rebuilt preimage');
  else missing.push(`the correlation does not verify: ${signatureReason}`);

  // 6 — the artifact must come from a commit that exists, on a clean tree. A capture from a dirty
  // tree names a state nobody can fetch, which is the ceiling the prove path already enforces.
  const prov = pin.provenance_from_artifact || {};
  const cleanCommit = prov.working_tree_dirty === false && /^[0-9a-f]{40}$/.test(prov.source_commit || '');
  if (cleanCommit) present.push(`producer ${pin.producer.digest}, working tree clean`);
  else missing.push('the capture is not reproducible from a clean commit');

  // 7 — THE NEGATIVE POLE. A profile that has only ever seen the passing case cannot say whether
  // its own check does anything. This is not a spliced file: it is a SECOND run of the same
  // producer, at the same commit, over the same contract, with a readback naming a different
  // commit — and the producer itself refused (POINT 8 MODELLED, no correlation, exit 1).
  //
  // Requiring it here is what makes COVERED mean "the check fires", not "the file parsed".
  // A MISSING pole is a NAMED GAP, not a crash. Measured: throwing here made the CLI exit 1, the
  // code for "disproved", when the honest answer is "unproved" — and this repo keeps those apart
  // on purpose (exit 3 vs exit 1). An absent fixture must downgrade the claim, never fail the run.
  let negative = null;
  try { ({ doc: negative } = readJson('negative-transcript.json')); } catch (err) {
    missing.push(`the negative pole is unreadable (${(err && err.code) || 'error'}) — `
      + 'a profile with no control cannot be shown to fire');
  }
  const negP8 = negative ? (negative.points || []).find((p) => p.n === 8) : null;
  const negativeRefused = !!negP8 && negP8.state !== 'PROVEN' && !negative.correlation;
  if (negativeRefused) {
    present.push(`negative pole: the same producer refused an uncorrelated readback `
      + `(POINT 8 ${negP8.state}, no correlation emitted)`);
  } else {
    missing.push('the negative pole does NOT refuse — the check cannot be shown to fire');
  }
  // Two different runs, or the "negative" is the positive under another name.
  if (negative && negative.run_id === artifact.run_id) {
    missing.push('the negative pole shares the positive run_id — it is the same run, not a control');
  }

  // 8 — AUTHORIZATION CONTINUITY. Everything above can hold while the transcript carries TWO
  // grants: a server authorize at POINT 1 and a locally minted one at POINTS 2-7. The contract
  // correlation does not notice — it binds the merge to the contract, not the execution to the
  // authorization. MEASURED on this fixture: issuance d33032a5 vs consumed d26dbacc.
  //
  // The structured block is REQUIRED. An artifact from before the continuity gate records the
  // identities only in POINT 2's prose, and pinning a sentence is not verifying a binding — so its
  // absence is a named gap, never an assumed pass.
  const issuance = artifact.issuance || null;
  const cont = artifact.continuity || null;
  const issuedJti = issuance && typeof issuance.jti === 'string' ? issuance.jti : null;
  const issuedScope = issuance && issuance.grant && issuance.grant.scope_hash
    ? issuance.grant.scope_hash : null;

  let continuous = false;
  if (!cont) {
    // Corroboration from what IS recorded, so the gap names the actual identities rather than
    // only the missing field.
    const p2 = points.find((p) => p.n === 2);
    const seen = p2 && typeof p2.detail === 'string' ? (p2.detail.match(/jti ([0-9a-f-]{8,})/) || [])[1] : null;
    missing.push('authorization_not_continuous: the artifact records no structured continuity block'
      + (issuedJti && seen && seen !== issuedJti
        ? ` — and the identities it does record disagree: server jti ${issuedJti.slice(0, 12)}, `
          + `executor jti ${seen.slice(0, 12)}`
        : ''));
  } else if (cont.continuous !== true) {
    const ids = cont.identities || {};
    missing.push(`authorization_not_continuous (${cont.reason}): server jti `
      + `${String(ids.issued_jti || '?').slice(0, 12)}, executor jti `
      + `${String(ids.consumed_jti || '?').slice(0, 12)}`);
  } else {
    // Re-checked here, not taken on the producer's word: the profile states the claim, so the
    // profile verifies it.
    const ids = cont.identities || {};
    const jtiOk = !!issuedJti && ids.consumed_jti === issuedJti && ids.attestation_jti === issuedJti;
    const scopeOk = !issuedScope || !c || c.scope_hash === issuedScope;
    if (jtiOk && scopeOk) {
      continuous = true;
      present.push(`authorization continuous: one grant (${issuedJti.slice(0, 12)}) through `
        + 'authorize, consume, attestation and correlation');
    } else {
      missing.push(`authorization_not_continuous: ${jtiOk ? 'the correlation binds a scope the '
        + 'server did not authorize' : 'the consumed or attested jti is not the issued one'}`);
    }
  }

  // 9 — THE WITNESS MUST NOT POSTDATE THE RUN. Fail-closed: an unparseable timestamp is refused
  // rather than skipped, because "we could not read the clock" must not grade like "the clock was fine".
  const observedAt = Date.parse(readback.observed_at);
  const finishedAt = Date.parse(artifact.finished_at);
  let witnessTimely = false;
  if (!Number.isFinite(observedAt) || !Number.isFinite(finishedAt)) {
    missing.push('readback_unreadable_time: observed_at or finished_at is not a parseable instant');
  } else if (observedAt > finishedAt + WITNESS_SKEW_MS) {
    const days = ((observedAt - finishedAt) / 86400000).toFixed(2);
    missing.push(`readback_future: the witness observed ${readback.observed_at}, ${days} days AFTER `
      + `the run finished (${artifact.finished_at}) — an observation cannot postdate what it observes`);
  } else {
    witnessTimely = true;
    present.push('the witness observation does not postdate the run');
  }

  const correlated = oneRun && mergeProven && hasFields && commitsAgree && signatureValid
    && cleanCommit && negativeRefused && !!negative && negative.run_id !== artifact.run_id
    && continuous && witnessTimely;
  const coverage = correlated ? COVERAGE.COVERED : COVERAGE.PARTIAL;

  return {
    profile: 'END_TO_END',
    coverage,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: RESULT.PASS,
    green: coverage === COVERAGE.COVERED,
    self_minted: false,
    correlated,
    run_id: artifact.run_id,
    contract_commit: c ? c.contract_commit : null,
    point8: p8 ? { n: 8, state: p8.state } : null,
    // The overlay reads these names (assurance-profiles.js:491-493). Two poles, one each: the
    // correlated run and the same producer's refusal of an uncorrelated readback.
    positive: 1,
    negative: 1,
    vector_ids: ['E2E-CONTRACT-CORRELATED', 'E2E-CONTRACT-UNCORRELATED-REFUSED'],
    present,
    missing,
    gaps: missing,
    why_empty: correlated ? null
      : 'the vendored run is not correlated — see gaps; a fixture that cannot be re-verified is not evidence',
    does_not_prove: E2E_CONTRACT_DOES_NOT_PROVE.slice(),
    pin,
  };
}

module.exports = {
  FIXTURE_DIR, CORRELATION_V, E2E_CONTRACT_DOES_NOT_PROVE,
  assertPins, correlationPreimage, measureContractE2E,
};
