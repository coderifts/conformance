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
  'that the tokens in this artifact came from ONE run — every signature is checked individually, '
  + 'and a genuinely signed token from a different run of the same producer is accepted today '
  + '(cross_run_collage, reproduced three ways). A signed evidence root closes this; until one is '
  + 'emitted, END_TO_END is PARTIAL and 7/7 is not an operational claim',
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

/**
 * @param {string} name
 * @param {string} [dir]  the fixture directory; defaults to the vendored one.
 *
 * REDIRECTABLE ON PURPOSE. The mutation matrix (test/evidence-mutation-matrix.test.js) needs to
 * point the WHOLE measure at a mutated copy — including the pin recompute, since a mutation an
 * attacker makes would come with a matching pin. Verifying a mutation by re-implementing the
 * checks would test the re-implementation; this runs the real one.
 */
function readJson(name, dir = FIXTURE_DIR) {
  const bytes = fs.readFileSync(path.join(dir, name));
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
function assertPins(dir = FIXTURE_DIR) {
  const { doc: pin } = readJson('pin.json', dir);
  for (const a of pin.artifacts) {
    const abs = path.join(dir, a.path);
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

function measureContractE2E(opts = {}) {
  const dir = opts.dir || FIXTURE_DIR;
  const pin = assertPins(dir);
  const { doc: artifact } = readJson('transcript.json', dir);
  const { doc: keyring } = readJson('executor-keys.json', dir);
  const { doc: readback } = readJson('readback.json', dir);

  const present = [];
  const missing = [];

  const c = artifact.correlation || null;
  const points = Array.isArray(artifact.points) ? artifact.points : [];
  const p8 = points.find((p) => p.n === 8) || null;

  // 1 — the run is one run.
  // ONE RUN — and the sentence now covers what it checks.
  //
  // This read `typeof artifact.run_id === 'string'` and then PRINTED "one run_id across N points".
  // The points carry no run_id field at all, so the claim was about a comparison that never
  // happened: a point spliced in from another run, carrying that run's id, was invisible. Caught by
  // the mutation matrix, which is what a matrix is for.
  //
  // The points still have no run_id in an honest artifact, so this asserts the absence rather than
  // inventing a field: every point either says nothing about which run it belongs to, or says this
  // one. A foreign id is now a refusal instead of a decoration.
  const foreignRun = points.filter((p) => p.run_id != null && p.run_id !== artifact.run_id);
  const oneRun = typeof artifact.run_id === 'string' && artifact.run_id.length > 0
    && foreignRun.length === 0;
  if (oneRun) {
    present.push(`one run: ${artifact.run_id}, and no point among the ${points.length} claims another`);
  } else if (foreignRun.length > 0) {
    missing.push(`point ${foreignRun.map((p) => p.n).join(', ')} names a different run than the `
      + 'artifact — that is a splice, not a run');
  } else {
    missing.push('the artifact carries no run_id');
  }

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
  // ── EVERY SIGNATURE IN THE ENVELOPE, not just the correlation's ─────────────────────────────
  //
  // 1423. This block used to verify ONE signature — the correlation's — and the pin was expected
  // to cover the rest. It does not, and an auditor showed it: flip the last character of
  // `issuance.execution_grant`, recompute the pin, and the profile still graded COVERED. Both of
  // the auditor's mutations were reproduced against this file before it was changed.
  //
  // The pin and the signatures answer different questions. The pin says "these are the bytes we
  // vendored"; only a signature says "the named issuer produced them". Whoever can edit the bytes
  // can also edit the file the hash lives in, so a pin alone is a check against accident, not
  // against an editor.
  //
  // The verifier is the SHARED CORE (receipt-verifier), vendored under lib/vendor with a
  // VENDOR.sha256 pin, because the real shape of this bug was two verifiers disagreeing:
  // capability-demo's `prove --check` refused both mutations while this measure accepted them.
  // A third implementation here would have recreated that.
  let envelope = { ok: false, slots: [], failures: ['not attempted'] };
  try {
    const { verifyEvidenceEnvelope } = require('./vendor/receipt-verifier/verify-evidence.js');
    envelope = verifyEvidenceEnvelope(artifact, {
      issuerKeys: JSON.parse(fs.readFileSync(
        path.join(__dirname, 'vendor', 'receipt-verifier', 'keys', 'coderifts-keys.json'), 'utf8',
      )),
      executorKeys: keyring,
      // ABSENCE IS NOT A PASS. Deleting a token is the strongest tamper there is, so the three
      // slots this profile's claim rests on are required by name: the grant that authorized the
      // write, the transcript that records the run, and the correlation that binds them to the
      // contract commit. The attestation is not listed because this envelope does not carry one —
      // requiring a slot the producer never emits would fail every honest artifact.
      required: ['execution_grant', 'transcript_token', 'correlation'],
    });
  } catch (err) {
    envelope = {
      ok: false,
      slots: [],
      failures: [`the evidence verifier could not run: ${(err && err.message) || 'error'}`],
    };
  }
  const signatureValid = envelope.ok;
  if (signatureValid) {
    const named = envelope.slots.filter((x) => x.verified).map((x) => x.slot).join(', ');
    present.push(`every signed token authenticates against its issuer's key (${named})`);
  } else {
    for (const f of envelope.failures) missing.push(f);
  }

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
  try { ({ doc: negative } = readJson('negative-transcript.json', dir)); } catch (err) {
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
    // ANCHORED ON THE ISSUANCE, not on the block's own account of it. `ids.issued_jti` is a field
    // a human reads, so it is checked too: a block asserting one issued jti while the issuance
    // records another is internally inconsistent, and an inconsistency nobody names is a place to
    // hide one. (Found by the mutation matrix: rewriting ids.issued_jti alone changed nothing.)
    const jtiOk = !!issuedJti && ids.consumed_jti === issuedJti && ids.attestation_jti === issuedJti
      && (ids.issued_jti == null || ids.issued_jti === issuedJti);
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

  // 10 — CROSS-RUN COLLAGE (1439/1432). THE GAP THAT MAKES THIS PARTIAL TODAY.
  //
  // ── REPRODUCED 2026-09-06, three ways ────────────────────────────────────────────────────
  //
  // Every check above authenticates tokens INDIVIDUALLY. None of them can say the tokens came
  // from the SAME RUN. So take the negative pole — a real second run of the same producer, whose
  // every token is genuinely signed — and move one of its tokens into the positive artifact:
  //
  //   transcript_token  from the negative run → COVERED
  //   execution_grant   from the negative run → COVERED
  //   chain_receipt     from the negative run → COVERED
  //
  // Pin recomputed in each case, as an editor of vendored bytes would. Nothing is forged: every
  // signature verifies, because each token really was issued. The artifact is a COLLAGE of two
  // runs presented as one, and 1423's authentication cannot see it — authenticity is a property
  // of a token, and "one run" is a property of a SET.
  //
  // ── WHY THIS IS A NAMED GAP AND NOT A FLIPPED CONSTANT ───────────────────────────────────
  //
  // The honest mechanism is the one this profile uses everywhere else: state what is missing and
  // let coverage follow. When an artifact carries a signed cr.evidence.root.v1 — one manifest
  // binding run_id, producer and the exact digest of every token — this gap closes on its own and
  // COVERED returns without editing a verdict by hand. Until a producer emits one, 7/7 would be
  // an over-claim, and does_not_prove discipline says the over-claim is the thing to remove.
  const root = artifact.evidence_root || null;
  const oneRunProven = !!root;
  if (!root) {
    missing.push('cross_run_collage: the artifact carries no cr.evidence.root.v1, so nothing binds '
      + 'its tokens to ONE run. Measured: a genuinely signed transcript_token, execution_grant or '
      + 'chain_receipt taken from a DIFFERENT run of the same producer (pin recomputed) is accepted '
      + 'here today. Every token is authentic; the SET is not shown to be one run.');
  } else {
    present.push('cr.evidence.root.v1 binds every token to one run');
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

  // `oneRunProven` is a CONJUNCT, not a note. Everything else here is a property of a token or a
  // pair; this is the property of the SET, and it is the one an authentic-token collage defeats.
  // Leaving it out of the verdict while printing it in `missing` would be the exact shape this
  // profile refuses everywhere else: a stated gap that does not change the grade.
  const correlated = oneRun && mergeProven && hasFields && commitsAgree && signatureValid
    && cleanCommit && negativeRefused && !!negative && negative.run_id !== artifact.run_id
    && continuous && witnessTimely && oneRunProven;
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
