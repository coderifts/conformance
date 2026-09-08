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
/**
 * The limits that hold WHATEVER the artifact carries.
 *
 * These are structural: no capture can retire them, so they are constants.
 */
const E2E_INVARIANT_DOES_NOT_PROVE = Object.freeze([
  // CORRECTED after measuring the root's slot list. This line used to say the parents were "bound
  // by the evidence root", which is FALSE: the root binds tokens, and target_state_transition is
  // not one of them. The reassuring half of a limit is the half most worth checking.
  'that the target-state transition was re-derived here — conformance holds no repository, so the '
  + 'authorized commit\'s parents are the ones the PRODUCER recorded, checked only against the '
  + 'base it also recorded. NO SIGNATURE BINDS THAT BLOCK. What can be anchored is: the '
  + 'observation is checked field-by-field against the root-bound readback bytes, and the '
  + 'authorized commit and payload digest against the signed correlation — so an edited block is '
  + 'caught wherever an anchor exists. `base` and `parents` have no anchor, and an artifact that '
  + 'is internally consistent about them is believed (RECORDED, not re-measured)',
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
 * The limits that depend on WHAT WAS MEASURED — generated, never recited.
 *
 * ── WHY THIS IS NOT A CONSTANT ANY MORE ─────────────────────────────────────────────────────
 *
 * The static list carried this line long after it stopped being true:
 *
 *   "…a genuinely signed token from a different run of the same producer is accepted today
 *    (cross_run_collage). A signed evidence root closes this; until one is emitted, END_TO_END is
 *    PARTIAL and 7/7 is not an operational claim"
 *
 * A root-bearing capture was vendored, the profile graded COVERED, the CLI printed 7/7 — and the
 * package went on shipping a sentence saying it was PARTIAL and 7/7 was not operational. Both were
 * printed by the same command. A reader could not tell which one to believe, and the honest answer
 * is that a hand-maintained limit describes the capture it was written for, not the one in the box.
 *
 * So the limits about the root are DERIVED from whether a root is there. When one is, the line
 * says what the root does NOT bind — which is the real residual, and a different sentence.
 */
function e2eDoesNotProve({ rootPresent, attestationCarried }) {
  const derived = [
    rootPresent
      ? 'that the executor reported its own run honestly — the evidence root binds these tokens to '
        + 'ONE run and closes third-party splicing, and it says nothing about an executor '
        + 'misreporting a run it really performed. The root is signed by that same executor'
      : 'that the tokens in this artifact came from ONE run — every signature is checked '
        + 'individually, and a genuinely signed token from a different run of the same producer is '
        + 'accepted (cross_run_collage). This capture carries no cr.evidence.root.v1, so the set is '
        + 'not bound and END_TO_END is PARTIAL',
    attestationCarried
      ? 'that the executor\'s attestation was witnessed by anyone — it is the executor\'s own '
        + 'signature over its own transition, re-checked here against the executor registry. '
        + 'Trusted-executor integrity, not an external witness'
      : 'that any executor sealed the transition — this capture carries no cr.exec.attest.v1 bytes, '
        + 'so nothing signed the change and the transition is CARRIED, not proven',
  ];
  return Object.freeze([...E2E_INVARIANT_DOES_NOT_PROVE.slice(0, 1), ...derived,
    ...E2E_INVARIANT_DOES_NOT_PROVE.slice(1)]);
}

/** Kept as an export for readers that want the structural half alone. */
const E2E_CONTRACT_DOES_NOT_PROVE = E2E_INVARIANT_DOES_NOT_PROVE;

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
  const { bytes: readbackBytes, doc: readback } = readJson('readback.json', dir);

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

  // 2 — POINT 8 IS PROVEN IN THIS RUN (not in some other transcript).
  //
  // ── THE RENAME, AND WHY BOTH NAMES ARE ACCEPTED ──────────────────────────────────────────
  //
  // The point was called MERGE. On a bare-Git target nothing merges: the operation is
  // `git.ref.update` and its purpose is to set a ref, so the state is now
  // TARGET_STATE_TRANSITION_PROVEN. Calling it a merge invited a reader to hear "a pull request
  // was merged", which is PATH B and is not what any of this proves.
  //
  // `PROVEN` stays accepted because every vendored artifact to date carries it, and refusing them
  // would be this measure declaring a rename it did not perform on evidence that already exists.
  const PROVEN_STATES = ['PROVEN', 'TARGET_STATE_TRANSITION_PROVEN'];
  const transitionProven = !!p8 && PROVEN_STATES.includes(p8.state);
  if (transitionProven) {
    present.push(`POINT 8 target-state transition is ${p8.state} in this run`);
  } else {
    missing.push(`POINT 8 is ${p8 ? p8.state : 'absent'} — no proven target-state transition`);
  }

  // ── THE FOUR CORRELATIONS, RE-CHECKED OFFLINE ────────────────────────────────────────────
  //
  // Only when the artifact carries a transition block. Legacy artifacts have none and are graded
  // exactly as before — this adds a check, it does not retro-fail evidence that predates it.
  //
  // WHAT "OFFLINE" COSTS, SAID PLAINLY. The demo's grader runs `git cat-file` against the live
  // target to read the authorized commit's parents. Conformance holds no repository, so it CANNOT
  // re-derive them: it re-checks the parents the producer RECORDED. Recorded, not re-measured.
  //
  // ── WHICH HALVES OF THIS BLOCK ARE ANCHORED, AND WHICH ARE NOT ──────────────────────────
  //
  // MEASURED, and it corrected an overclaim that stood in this comment: the block is NOT bound by
  // the evidence root. The root's slots are chain_receipt, execution_grant, transcript_token,
  // correlation, atomic_attestation and provider_readback — `target_state_transition` is none of
  // them, so an editor of vendored bytes can rewrite it freely and no signature notices.
  //
  // Two of its three halves are nevertheless anchored, TRANSITIVELY, and the anchors are checked
  // below rather than assumed:
  //
  //   observation  → `readback.json`, the observer's exact stdout, which IS a root slot. The
  //                  block's copy must agree with those bytes field for field.
  //   expected     → the signed correlation, which IS a root slot: it carries contract_commit,
  //                  and its scope_hash is the digest of the authorized payload.
  //
  // WHAT REMAINS UNANCHORED: `expected.base` and `expected.parents`. Nothing signed carries them.
  // They are the producer's word, checked here only for internal consistency, and the
  // does_not_prove line says exactly that rather than the reassuring version.
  const tst = artifact.target_state_transition || null;
  const transitionGaps = [];
  if (tst) {
    const obs = tst.observation || {};
    const exp = tst.expected || {};
    const check = (id, ok, detail) => {
      if (ok) present.push(`transition ${id}: re-checked offline`);
      else { missing.push(`transition ${id}: ${detail}`); transitionGaps.push(id); }
      return ok;
    };

    // THE ANCHOR. Without it every field below is compared against a sibling in the same
    // unsigned block — an artifact agreeing with itself, which is the shape this profile refuses
    // everywhere else. `readback.json` is bound by the root, so agreeing with it is a real
    // constraint; disagreeing with it means one of the two was edited.
    for (const k of ['observed_commit', 'before_commit', 'contract_blob_digest', 'commit',
      'observer_mode', 'observation_source', 'contract_path', 'canonical_target_uri']) {
      if (readback[k] === undefined && obs[k] === undefined) continue;
      check(`observation_anchored_${k}`, readback[k] === obs[k],
        `the transition block records ${k} ${JSON.stringify(obs[k])} but the root-bound readback `
        + `says ${JSON.stringify(readback[k])} — one of the two was edited`);
    }
    check('after_state_token', obs.observed_commit === exp.contract_commit,
      `the observation read ${String(obs.observed_commit).slice(0, 12)} and the grant authorized `
      + `${String(exp.contract_commit).slice(0, 12)}`);
    check('blob_digest', obs.contract_blob_digest === exp.contract_blob_digest,
      'the bytes at the observed commit are not the bytes the grant bound');
    check('content_sha256', exp.after_payload_digest == null
      || obs.contract_blob_digest === exp.after_payload_digest,
      'the bytes at the observed commit are not the preflight after_payload');
    check('single_parent', Array.isArray(exp.parents)
      && exp.parents.length === 1 && exp.parents[0] === exp.base,
      `the authorized commit records parents [${(exp.parents || []).map((x) => String(x).slice(0, 12)).join(', ')}] `
      + `and a single parent ${String(exp.base).slice(0, 12)} was required`);
    check('state_transition', obs.before_commit === exp.base,
      `the ref moved from ${String(obs.before_commit).slice(0, 12)} and the grant was issued against `
      + `${String(exp.base).slice(0, 12)}`);
    check('observer_mode', obs.observer_mode === 'read_only'
      && obs.observation_source === 'git-object-database',
      `the observation declares mode ${obs.observer_mode} / source ${obs.observation_source}`);

    // NOTHING ELSE MOVED, re-checked here and not read out of the producer's grade.
    //
    // MEASURED on a real target: the authorized bytes at the governed path, single parent BASE,
    // plus one extra file the grant never mentioned, satisfies every check above. The producer
    // refuses it; without this line conformance would not, and the profile's job is to be the
    // reader that does not take the producer's word.
    if (!Array.isArray(obs.changed_paths)) {
      check('no_unauthorized_company', false,
        `the observation reports no changed_paths (${obs.changed_paths_error || 'absent'}) — what `
        + 'else the move carried is unknown, and unknown is not clean');
    } else {
      const extra = obs.changed_paths.filter((x) => x !== exp.contract_path);
      check('no_unauthorized_company', extra.length === 0,
        `the transition also changed ${extra.join(', ')} — the grant authorized the governed `
        + `contract (${exp.contract_path}) and nothing else`);
    }

    // THE OTHER ANCHOR. `expected` is the grant's side of the comparison, and the correlation is
    // the only signed thing that carries it. Checking the block against the correlation is what
    // stops `expected.contract_commit` being rewritten to whatever the observation happens to say.
    if (c && typeof c.contract_commit === 'string') {
      check('expected_anchored_contract_commit', exp.contract_commit === c.contract_commit,
        `the transition block authorizes ${String(exp.contract_commit).slice(0, 12)} but the signed `
        + `correlation binds ${String(c.contract_commit).slice(0, 12)}`);
    }
    // ── THE EXECUTOR'S SEAL, RE-VERIFIED HERE ───────────────────────────────────────────
    //
    // MEASURED before this was written: deleting the attestation token, corrupting its signature,
    // or flipping `executor_attested` to ok:true all left this profile at COVERED. The measure was
    // reading the PRODUCER'S OWN GRADE out of `checks[]` — a recorded boolean, re-reported. That is
    // the caller-boolean class one level up: the producer decided, and conformance wrote it down.
    //
    // The token is now verified from its bytes, and the verdict is a conjunct.
    const attToken = tst.attestation;
    if (typeof attToken !== 'string' || attToken.length === 0) {
      check('executor_attested', false,
        'the capture carries no cr.exec.attest.v1 bytes — the root may record a digest for the '
        + 'slot, but nothing here can be checked, so the transition is CARRIED, not proven');
    } else {
      let av = null;
      try {
        const { verifyExecutionAttestation } = require('./vendor/receipt-verifier/verify-attest.js');
        av = verifyExecutionAttestation(attToken, { registry: keyring });
      } catch (err) {
        av = { valid: false, status: 'VERIFIER_UNAVAILABLE', reason: (err && err.message) || 'error' };
      }
      const okSig = check('executor_attested', av && av.valid === true,
        `the executor attestation does not verify (${(av && av.status) || 'unknown'}`
        + `${av && av.reason ? ': ' + av.reason : ''})`);
      if (okSig) {
        const body = av.payload || {};
        // BOUND TO THIS TRANSITION, recomputed rather than trusted: before ⨝ after ⨝ bytes.
        const want = `sha256:${crypto.createHash('sha256').update([
          String(obs.before_commit || ''), String(obs.observed_commit || ''),
          String(obs.contract_blob_digest || ''),
        ].join('\x1f'), 'utf8').digest('hex')}`;
        check('attestation_binds_transition', body.result_digest === want,
          `the attestation commits result ${String(body.result_digest).slice(0, 19)}… and this `
          + `transition hashes to ${want.slice(0, 19)}… — a signature over a different move`);
        // BOUND TO THE AUTHORIZATION THAT PERMITTED IT.
        //
        // Compared against the TRANSITION's grant, not the issuance grant — because this capture
        // still carries two. Binding it to `issuance.grant` is the stronger check and is exactly
        // what one-grant-end-to-end unlocks; asserting it today would refuse every capture any
        // producer can currently emit, which is a gate against nothing.
        const tg = tst.grant || null;
        check('attestation_binds_grant', !!tg && body.grant_jti === tg.grant_id,
          `the attestation commits grant ${String(body.grant_jti).slice(0, 12)} and the transition `
          + `records ${tg ? String(tg.grant_id).slice(0, 12) : '(no grant)'} — two authorizations`);
      }
    }

    if (c && typeof c.scope_hash === 'string' && exp.contract_blob_digest != null) {
      check('expected_anchored_blob_digest', exp.contract_blob_digest === c.scope_hash,
        `the transition block binds bytes ${String(exp.contract_blob_digest).slice(0, 19)}… but the `
        + `signed correlation binds scope ${String(c.scope_hash).slice(0, 19)}…`);
    }
  }

  // ── THE ARTIFACT MUST AGREE WITH ITSELF ─────────────────────────────────────────────────
  //
  // Everything above is RE-DERIVED from bytes, which is right — the producer's grade is not
  // evidence. But re-deriving alone made the producer's own record decorative: MEASURED, an
  // artifact whose `target_state_transition.state` said CARRIED_UNVERIFIED, or whose `checks[]`
  // was emptied entirely, still graded COVERED. Conformance would have certified a capture that
  // says of itself that it proves nothing.
  //
  // This does NOT trust the recorded verdict. It refuses a capture that contradicts itself, in
  // either direction: a producer claiming more than its bytes support is a forgery, and one
  // claiming less is a capture nobody should be publishing as proof.
  if (tst) {
    const recorded = tst.state;
    const derived = transitionGaps.length === 0
      ? 'PROVEN_BY_TRUSTED_EXECUTOR' : 'CARRIED_UNVERIFIED';
    if (recorded !== derived) {
      missing.push(`transition self_consistent: the capture records state ${recorded} and its own `
        + `bytes re-derive ${derived} — an artifact that disagrees with itself is not evidence`);
      transitionGaps.push('self_consistent');
    } else {
      present.push(`transition self_consistent: the capture records ${recorded}, and its bytes say the same`);
    }
    const recordedChecks = Array.isArray(tst.checks) ? tst.checks : [];
    const failed = recordedChecks.filter((x) => x && x.ok === false).map((x) => x.id);
    if (recordedChecks.length === 0) {
      missing.push('transition self_consistent: the capture records NO checks — a transition block '
        + 'with no grading is a claim with its working removed');
      transitionGaps.push('self_consistent_checks');
    } else if (failed.length > 0 && transitionGaps.length === 0) {
      missing.push(`transition self_consistent: the producer records ${failed.join(', ')} as FAILED `
        + 'and these bytes re-derive them as passing — one of the two is wrong, and a profile '
        + 'cannot choose the convenient one');
      transitionGaps.push('self_consistent_checks');
    }
  }

  // ── THE SUMMARY MUST AGREE WITH THE TOKEN ───────────────────────────────────────────────
  //
  // `issuance.grant` is an UNSIGNED convenience copy of what the signed grant says. MEASURED:
  // rewriting its `after_payload_hash` to a digest the grant never carried left the profile at
  // COVERED — every signature still verified, because the check reads the TOKEN and the forged
  // field is beside it. Nobody is deceived by the token; a human reading the artifact is.
  //
  // So the copy is compared against the decoded token. This is not a second signature check: it
  // refuses an artifact whose human-readable half and machine-readable half disagree.
  let summaryAgrees = true;
  const issG = (artifact.issuance && artifact.issuance.grant) || null;
  if (issG && typeof (artifact.issuance || {}).execution_grant === 'string') {
    let decoded = null;
    try {
      decoded = JSON.parse(Buffer.from(
        artifact.issuance.execution_grant.split('.')[0], 'base64url',
      ).toString('utf8'));
    } catch (_) { decoded = null; }
    if (!decoded) {
      summaryAgrees = false;
      missing.push('issuance summary: the execution_grant token does not decode, so the readable '
        + 'copy beside it cannot be checked against anything');
    } else {
      const disagreements = Object.keys(issG)
        .filter((k) => Object.prototype.hasOwnProperty.call(decoded, k))
        .filter((k) => String(issG[k]) !== String(decoded[k]));
      if (disagreements.length > 0) {
        summaryAgrees = false;
        missing.push(`issuance summary: the readable grant disagrees with the signed token on `
          + `${disagreements.join(', ')} — an artifact whose summary and signature say different `
          + 'things is not evidence, whichever one is true');
      } else {
        present.push('issuance summary: the readable grant matches the signed token field for field');
      }
    }
  }

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
  // THE ROOT, VERIFIED — not merely present (1432). A manifest nobody checks would be the pin
  // mistake again one layer up: the digest of a token is only worth what the signature over the
  // digest list is worth, and only if somebody recomputes both.
  const root = artifact.evidence_root || null;
  let oneRunProven = false;
  if (root) {
    try {
      const { verifyEvidenceRootBinding } = require('./vendor/receipt-verifier/verify-evidence.js');
      const pub = crypto.createPublicKey(keyring.keys[0].public_key_pem);
      const bound = verifyEvidenceRootBinding(artifact, {
        executorKey: pub,
        // The readback is a SIDECAR: the artifact does not republish it, and binding its exact
        // bytes is what stops a readback from another run being paired with this artifact.
        sidecars: { provider_readback: readbackBytes.toString('utf8') },
      });
      oneRunProven = bound.ok;
      if (bound.ok) {
        present.push(`cr.evidence.root.v1 binds every token to run ${root.run_id} `
          + `(${bound.checks.length} checks, ${bound.library})`);
      } else {
        for (const f of bound.failures) missing.push(`evidence_root: ${f}`);
      }
    } catch (err) {
      missing.push(`evidence_root: the root verifier could not run: ${(err && err.message) || 'error'}`);
    }
  }
  if (!root) {
    missing.push('cross_run_collage: the artifact carries no cr.evidence.root.v1, so nothing binds '
      + 'its tokens to ONE run. Measured: a genuinely signed transcript_token, execution_grant or '
      + 'chain_receipt taken from a DIFFERENT run of the same producer (pin recomputed) is accepted '
      + 'here today. Every token is authentic; the SET is not shown to be one run.');
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
  // `transitionGaps.length === 0` is a CONJUNCT, and it was not one until it was measured.
  //
  // MEASURED: with the old 6/7 fixture the profile was PARTIAL for the collage gap anyway, so
  // every negative control that mutated the transition block asserted `coverage !== COVERED`
  // against a fixture that was never COVERED to begin with — eight tests that could not fail. The
  // fresh 7/7 capture removed the cover and exposed the real defect: a mutated after_state_token
  // pushed a line into `missing` and the profile still graded COVERED. A stated gap that does not
  // move the grade is precisely what this file refuses everywhere else, and it had grown here.
  // `authorizedUnderProfile` is a CONJUNCT. A profile that grades the authorization and then does
  // not let it move the coverage is a check nobody acts on — the shape this file refuses elsewhere.
  const correlated = oneRun && transitionProven && transitionGaps.length === 0
    && hasFields && commitsAgree && signatureValid
    && cleanCommit && negativeRefused && !!negative && negative.run_id !== artifact.run_id
    && continuous && witnessTimely && oneRunProven;
  // ── THE AUTHORIZATION VERDICT, QUOTED (1459) ────────────────────────────────────────────
  //
  // `correlated` above is a COVERAGE conjunction: eleven facts this profile needs, most of them
  // about the capture (a clean commit, a negative pole, a timely witness) rather than about
  // authorization. The core predicate answers a different, narrower question — did an issuer
  // authorize this, and are these bytes one run — and it is the question the guard, Prove and the
  // contract-gate also ask. Quoting it here is what makes those four answers the same answer.
  //
  // It does NOT replace the coverage grade. A profile that swapped its own conjuncts for the core
  // would start reporting COVERED for a capture with no negative pole, which is a different claim.
  // The core's state is carried alongside, in the shared vocabulary.
  let authorization = null;
  let authorizedUnderProfile = false;
  try {
    const { verifiedExecutionBinding } = require('./vendor/receipt-verifier/verified-execution-binding.js');
    const iss = artifact.issuance || {};
    const g = iss.grant || {};
    const issuerDoc = JSON.parse(fs.readFileSync(
      path.join(__dirname, 'vendor', 'receipt-verifier', 'keys', 'coderifts-keys.json'), 'utf8',
    ));
    const ring = new Map((issuerDoc.keys || [])
      .filter((k) => k && k.kid && k.public_key_pem)
      .map((k) => [k.kid, {
        publicKey: crypto.createPublicKey(k.public_key_pem),
        status: k.status || 'active', retired_at: null, compromised_at: null,
      }]));
    const at = Date.parse(g.not_before || g.iat || artifact.started_at);
    const b = verifiedExecutionBinding({
      receipt: { verified: artifact.transcript_verifies === true },
      grant: {
        token: iss.execution_grant || '',
        keyring: ring,
        expectedKid: null,
        ...(Number.isFinite(at) ? { now: at + 1000 } : {}),
      },
      evidenceRoot: artifact.evidence_root
        ? {
          artifact,
          executorKey: crypto.createPublicKey(keyring.keys[0].public_key_pem),
          sidecars: { provider_readback: readbackBytes.toString('utf8') },
        }
        : null,
      // The readback is an UNSIGNED document. The core reports RECORDED_UNWITNESSED for it, which
      // is the same sentence this profile's does_not_prove has always carried — so it is not
      // REQUIRED here, and the state records the ceiling rather than failing the grade for it.
      providerReadback: { signed: false },
      committed: artifact.verdict === 'PASS',
      // ── THE CLOSED PROFILE, NOT A CUSTOM SET (1465 phase 4) ─────────────────────────────
      //
      // This profile fixes its authorities — receipt + issuer grant + executor attestation +
      // one-run root — and the caller cannot shorten it. Until one grant carried the whole chain
      // it read COMMIT_UNPROVEN here, because the attestation sealed the git transition while the
      // issuance grant authorized a database write: "the attestation binds a different grant id
      // than the verified grant". That was the two-authorization collage stated by the core, and
      // it is why this stayed in the custom lane one round longer.
      profile: 'TRUSTED_EXECUTOR_INTEGRITY_V1',
      attestation: (() => {
        const tok = tst && typeof tst.attestation === 'string' ? tst.attestation : '';
        if (!tok) return null;
        try {
          const { verifyExecutionAttestation } = require('./vendor/receipt-verifier/verify-attest.js');
          return { token: tok, registry: keyring, verify: verifyExecutionAttestation };
        } catch (_) { return null; }
      })(),
    });
    authorization = { state: b.state, shortfalls: b.shortfalls };
    // ── WHICH LANE, SAID OUT LOUD (1465) ────────────────────────────────────────────────
    //
    // The core no longer lets a CUSTOM authority set reach `authorized_and_committed` — asking for
    // less can no longer produce the global success token. This profile asks a custom set, so it
    // reads `requirements_satisfied`.
    //
    // MEASURED when the core changed: branching on `authorized_and_committed` alone made this
    // present-line VANISH silently — the else branch had no shortfalls to report, so a satisfied
    // check simply stopped being stated. A positive fact that disappears is the same defect as a
    // negative one that is hidden, and it is harder to notice.
    //
    // The line now names the lane, so a reader can see this is a CUSTOM aggregation and not the
    // closed profile. Moving to TRUSTED_EXECUTOR_INTEGRITY_V1 is the next phase and is blocked on
    // the producer: that profile also requires the executor attestation, and the core binds an
    // attestation to the ISSUANCE grant's id — while this capture's attestation seals the git
    // transition under a SECOND grant. One grant end-to-end has to land first, or this profile
    // would refuse a capture no producer can currently emit.
    if (b.authorized_and_committed) {
      authorizedUnderProfile = true;
      present.push(`authorization: ${b.state} under the CLOSED profile ${b.profile} `
        + `(proof_scope ${b.proof_scope}, externally_witnessed ${b.externally_witnessed})`);
    } else {
      // NOT TWICE. The core's `one_run_root` shortfall and this profile's `cross_run_collage` gap
      // are the SAME fact under two names — the profile has named it since 1439 and the README,
      // the CHANGELOG and the collage test all reference that name. Reporting both would inflate
      // the gap count and make "exactly one reason" untrue of an artifact with exactly one reason.
      //
      // So the core's state is always carried (that is the shared vocabulary), and only shortfalls
      // this profile does not ALREADY name are added to `missing`.
      for (const sf of b.shortfalls) {
        if (sf.startsWith('one_run_root') && missing.some((m) => m.startsWith('cross_run_collage'))) continue;
        missing.push(`authorization: ${sf}`);
      }
    }
  } catch (err) {
    authorization = { state: 'UNAVAILABLE', shortfalls: [(err && err.message) || 'error'] };
    missing.push(`authorization: the core predicate could not run: ${(err && err.message) || 'error'}`);
  }

  // `authorizedUnderProfile` is a CONJUNCT of the grade, not a line beside it. It is joined here
  // rather than inside `correlated` because the closed profile runs BELOW that expression — and a
  // grade that ignored it would be this file grading the authorization and then not using it.
  const coverage = (correlated && authorizedUnderProfile && summaryAgrees)
    ? COVERAGE.COVERED : COVERAGE.PARTIAL;

  return {
    profile: 'END_TO_END',
    coverage,
    authorization,
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
    does_not_prove: e2eDoesNotProve({
      rootPresent: !!artifact.evidence_root,
      attestationCarried: !!(tst && typeof tst.attestation === 'string' && tst.attestation),
    }).slice(),
    pin,
  };
}

module.exports = {
  FIXTURE_DIR, CORRELATION_V, E2E_CONTRACT_DOES_NOT_PROVE, E2E_INVARIANT_DOES_NOT_PROVE,
  e2eDoesNotProve,
  assertPins, correlationPreimage, measureContractE2E,
};
