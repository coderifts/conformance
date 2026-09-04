/**
 * ASSURANCE PROFILES — what a conformance run actually proves, split seven ways.
 *
 * WHY THIS EXISTS. This suite reported a single number. A single number collapses claims of very
 * different strength: "an adapter branches on execution_action" and "a merge was refused at the
 * provider" are not the same evidence, and one total cannot tell a reader which of them it holds.
 * Worse, a total is silent about what was never attempted — the reader cannot distinguish a claim
 * we tested from one we never wrote a vector for.
 *
 * THE RULE FOR PLACEMENT: every vector belongs to exactly ONE profile, the NARROWEST that fits,
 * and it is placed by WHAT IT PROVES rather than by what it is ABOUT. A vector whose subject is
 * provider enforcement but whose evidence is a local mirror of a published evaluator proves a
 * decision invariant, not a provider outcome. Counting it under PROVIDER_ENFORCED would make an
 * empty profile look populated, which is the exact inflation this split exists to prevent.
 *
 * TWO AXES, never conflated (auditor requirement):
 *   coverage       COVERED | PARTIAL | NOT_COVERED
 *   evidence_tier  LIVE | RECORDED | MODELLED | NOT_RUN
 *   result         PASS | FAIL   (separate: COVERED+LIVE+FAIL covers the property AND found a regression)
 * COVERED on the coverage axis still requires a positive+negative pair. PARTIAL is earned when
 * recorded evidence exists but a required negative or read-back is missing — the gap is named,
 * never filled in. MODELLED cannot be promoted to COVERED on an operational profile.
 * NOT_RUN is an evidence tier (nothing was attempted), not a coverage value.
 *
 * `--evidence recorded` (default) verifies vendored pinned external artifacts.
 * `--evidence live` produces new proof on available infra; without infra the recorded profiles
 * are NOT_RUN and do not silently fall back to recorded bytes.
 *
 * HISTORICAL THREE-STATE (kept as the coverage+tier product, not as a third axis):
 *   COVERED     — vectors exist, a subject can execute them, they run in `npm test`, AND
 *                 the runnable set contains at least one POSITIVE (the capability works)
 *                 and one NEGATIVE (a real mismatch / attack is refused). A profile with
 *                 only one polarity is not covered — that pair is what COVERED requires.
 *   NOT_RUN     — now an evidence_tier: vectors EXIST but nothing here can execute them.
 *   NOT_COVERED — no vector exists at all, OR runnable vectors exist but the
 *                 positive+negative pair is incomplete.
 * NOT_RUN was added because measuring found it, not because the taxonomy predicted it: 19 of the
 * 33 cases in cases.v1.json are vendored from the app and every shipped subject throws
 * `unknown case kind` on them. They are never selected by the default profile, so they never
 * appeared as failures — they simply were not there. A two-state model would have had to call
 * that either COVERED (false) or NOT_COVERED (also false, the vectors are right there in the
 * file). Naming the third state is the honest option. The two-axis split is the next honesty
 * step: a recorded signed transcript is not a live observation, and collapsing them was the
 * remaining inflation.
 *
 * NOTHING HERE RE-STATES A VECTOR'S OWN CEILING. Each vector keeps its own does-not-assert text.
 * The suite-wide ceiling is unchanged and lives in fixtures/adversarial.v1.json `honesty`:
 * a passing adversarial vector proves ONE NAMED SHAPE fails at the recorded version, never that
 * the class is closed.
 *
 * @module @coderifts/conformance/lib/assurance-profiles
 */
'use strict';

const { COVERAGE, EVIDENCE_TIER, RESULT } = require('./evidence-envelope');

/** @deprecated use COVERAGE + EVIDENCE_TIER. Kept so existing imports keep resolving. */
const STATUS = Object.freeze({
  COVERED: COVERAGE.COVERED,
  PARTIAL: COVERAGE.PARTIAL,
  NOT_COVERED: COVERAGE.NOT_COVERED,
  NOT_RUN: EVIDENCE_TIER.NOT_RUN,
});

const DEFAULT_EVIDENCE = 'recorded';

/**
 * Green only when coverage is COVERED and the evidence is LIVE or RECORDED.
 * PARTIAL is not a pass. MODELLED is never a pass. NOT_RUN is never a pass.
 * Accepts a row `{coverage, evidence_tier}` or the two axes as separate args.
 */
function isGreen(coverageOrRow, evidenceTier) {
  if (coverageOrRow && typeof coverageOrRow === 'object') {
    const c = coverageOrRow.coverage || coverageOrRow.status;
    const t = coverageOrRow.evidence_tier;
    return c === COVERAGE.COVERED
      && (t === EVIDENCE_TIER.LIVE || t === EVIDENCE_TIER.RECORDED);
  }
  if (evidenceTier == null) return false;
  return coverageOrRow === COVERAGE.COVERED
    && (evidenceTier === EVIDENCE_TIER.LIVE || evidenceTier === EVIDENCE_TIER.RECORDED);
}

/**
 * The seven profiles, in chain order (a claim later in the list depends on the ones before it).
 *
 * `asserts`      — what a COVERED verdict here would mean, in one sentence.
 * `does_not`     — the boundary, stated so a reader cannot over-read the profile name.
 * `why_empty`    — for a non-COVERED profile: why, and where it IS covered if anywhere.
 */
const PROFILES = Object.freeze([
  {
    id: 'DECISION_LOGIC',
    title: 'Verdict invariants',
    asserts:
      'Given a decision response, a consumer branches on execution_action and never on decision or '
      + 'safe_for_agent, and a verdict function returns the same verdict for the same input.',
    does_not:
      'Say that the verdict is CORRECT for a real change set, or that any of it is enforced anywhere.',
  },
  {
    id: 'RECEIPT_CRYPTO',
    title: 'Signature and binding',
    asserts:
      'A grant, execution attestation or monitoring attestation verifies offline against its keyring, '
      + 'and a token that is expired, misbound, mis-signed, malformed or issued under an unknown or '
      + 'retired key is refused with a named status.',
    does_not:
      'Say that a verified token was USED, consumed once, or honoured by any executor. Verification '
      + 'is stateless: it reads a document, it does not observe an action.',
    why_empty:
      'RETIRED FROM cases.v1.json (0.4.0) because a runner here would have MINTED the token '
      + 'from a scenario name and then verified it — a generator and a verifier in one '
      + 'repository agreeing with itself. The 23 EG-* / EG2-* / EG-A-* / MON-A-* rows stayed '
      + 'out of the vendored case file; every shipped subject still implements only `decide` '
      + 'and `tool_selection`. THE REMOVAL COULD NOT START HERE: cases.v1.json is vendored '
      + 'from the app and gated byte-identical. '
      + 'RECORDED COVERAGE (this release): the suite now VERIFIES receipt-verifier\'s committed '
      + 'signed token bytes (fixtures/recorded/receipt-crypto, pin sha256 of vectors.json, '
      + 'producer test/gen-vectors.js). Conformance does not mint those tokens (self_minted:false). '
      + 'A digest-pin mismatch is an error, not a skip. LIVE mode without a kernel is NOT_RUN '
      + 'and does not fall back to the recorded file. '
      + 'does_not_prove: the live kernel mints this today; the production signing key is current; '
      + 'the key-discovery endpoint is fresh; the grant is currently executable. '
      + 'It is not a claim that the property is unproven; cases.v1.json is still not where '
      + 'the proof lives — the proof is the pinned external artifact.'
  },
  {
    id: 'GUARDED_TOOL_TABLE',
    title: 'The tools handed to the guard',
    asserts:
      'The tool table a model is given is the one this suite records: the right member is selected '
      + 'for a given change, and each description carries the scoping facts a reader depends on.',
    does_not:
      'Say that the table is EXHAUSTIVE for a running host, or that a raw tool beside it is '
      + 'unreachable — that is CREDENTIAL_BOUNDARY, and it is not covered here.',
  },
  {
    id: 'CREDENTIAL_BOUNDARY',
    title: 'The raw host cannot write',
    asserts:
      'A host holding a provider credential cannot reach the target except through the guarded path.',
    does_not: null,
    why_empty:
      'A property of a RUNNING host, not of a decision response. cases.v1.json still has no vector. '
      + 'RECORDED from the capability-demo prove transcript: DENY is cr_host INSERT → SQLSTATE 42501 '
      + 'with articles count unchanged (before_count === after_count). POINT 3 is that denial, not '
      + 'catalog posture. Live mode without infra is NOT_RUN and does not fall back. '
      + 'does_not_prove is non-empty. Source comments in db.js are MODELLED and are not counted.',
  },
  {
    id: 'ATOMIC_COMMIT',
    title: 'Nonce + CAS + attestation as one transaction',
    asserts:
      'A claim and the mutation it authorises either both happen or neither does, and a replayed '
      + 'nonce cannot buy a second commit.',
    does_not: null,
    why_empty:
      'The public verifier is STATELESS, so cases.v1.json still has no atomicity vector — '
      + 'EG-A-STATE-NONCE-MISMATCH was a binding fact, not this claim. RECORDED from the '
      + 'capability-demo prove transcript: replay, concurrency, CAS-stale STATE_DRIFT, '
      + 'no-consume-only rollback, no-mutation-only 42501, before/after read-backs. Live mode '
      + 'without infra is NOT_RUN and does not fall back. POINT 8 merge is MODELLED and is '
      + 'not this profile.',
  },
  {
    id: 'PROVIDER_ENFORCED',
    title: 'Merge or deploy refused at the provider',
    asserts:
      'A provider (GitHub) actually refused a merge or a deploy because the gate said so — observed, '
      + 'not modelled.',
    does_not: null,
    why_empty:
      'Requires a live provider, a repository and a credential; this suite is offline and '
      + 'credential-free. The vectors that LOOK like coverage here are mirrors: ADV-1 re-implements '
      + 'the published required-check evaluator and is counted under DECISION_LOGIC, because a '
      + 'mirror agreeing with itself is not a provider refusing anything — and the fixture records '
      + 'that this mirror has diverged from the product before while every test stayed green. '
      + 'The excluded vector `ruleset_bypass` is the recorded absence for the ruleset surface.',
  },
  {
    id: 'END_TO_END',
    title: 'Authorization through to deploy',
    asserts:
      'The whole chain holds together on one real change: decision, receipt, guarded execution, '
      + 'atomic commit and provider enforcement, in sequence.',
    does_not: null,
    why_empty:
      'No vector has ever been written for it, and it cannot be reached offline: it depends on every '
      + 'profile above it, four of which are themselves not covered here. It is listed so a reader '
      + 'sees the top of the chain is untested rather than inferring it from the ones that pass. '
      + 'Unlike the other empty profiles, it has no `excluded` entry — nothing was attempted.',
  },
]);

const PROFILE_IDS = Object.freeze(PROFILES.map((p) => p.id));

/**
 * VECTOR → PROFILE. Exactly one profile per vector; the narrowest that fits.
 *
 * `runner` records HOW a vector executes, because that is what separates COVERED from NOT_RUN:
 *   'subject'  — a shipped subject executes it via cases.v1.json
 *   'test'     — a node:test assertion in test/
 *   'none'     — the vector exists as data and nothing here can execute it
 *
 * Attack-matrix execution coverage is recorded separately (ATTACK_MATRIX below).
 * A matrix vector that the runner actually five-point-checks is COVERED-by-execution
 * THERE, not a profile score. Putting those rows in VECTOR_MAP under ATOMIC_COMMIT
 * would turn an empty profile green — the inflation this split exists to prevent.
 */

/**
 * COVERED-by-execution for the attack-matrix runner. Not a profile. ATOMIC_COMMIT
 * stays NOT_COVERED: these are fail-closed adapter/reconciler checks, not
 * nonce+CAS+attestation as one transaction.
 *
 * `execute_ids` are the only rows the runner will attempt; everything else in
 * fixtures/attack-matrix.v1.json stays NOT_RUN, named.
 */
const ATTACK_MATRIX = Object.freeze({
  source: 'fixtures/attack-matrix.v1.json',
  runner: 'lib/attack-matrix-runner.js',
  populates_profile: null,
  covered_means: 'all five points (target, nonce, executor, attestation, gate) checked by executing a shipped adapter',
  not_run_means: 'vector exists, no executable check — or capability-demo adapters absent (NOT_RUN / capability_demo_absent, named; see package.json coderifts.capability_demo)',
  execute_ids: Object.freeze([
    'AM-GIT-MISSING-PIN',
    'AM-HTTP-MISSING-ETAG',
    'AM-RECONCILE-FORGED-ATTEST',
  ]),
});
/**
 * Polarity of a cases.v1.json vector. `safety` = must-not (NEGATIVE). `liveness` = floor
 * says execute (POSITIVE). Derived from the case file so a class edit cannot silently
 * leave COVERED claiming a pair it no longer has.
 */
function casePolarity(id) {
  // Lazy require: this module is loaded by the CLI before cases may be filtered.
  const { cases } = require('../cases.v1.json');
  const c = cases.find((x) => x.id === id);
  if (!c) throw new Error(`assurance-profiles: ${id} is mapped but not in cases.v1.json`);
  if (c.class === 'safety') return 'negative';
  if (c.class === 'liveness') return 'positive';
  throw new Error(`assurance-profiles: ${id} has class=${c.class}, need safety|liveness`);
}

function fromCases(ids, profile) {
  return ids.map((id) => ({
    vector: id,
    profile,
    source: 'cases.v1.json',
    runner: 'subject',
    polarity: casePolarity(id),
  }));
}

/**
 * COVERED requires both polarities on the RUNNABLE set.
 * `pair` counts as both (an aggregated vector that already contains allow AND block).
 */
function polarityCounts(runnable) {
  let positive = 0;
  let negative = 0;
  for (const v of runnable) {
    if (v.polarity === 'positive' || v.polarity === 'pair') positive += 1;
    if (v.polarity === 'negative' || v.polarity === 'pair') negative += 1;
  }
  return { positive, negative, complete: positive > 0 && negative > 0 };
}

/**
 * Coverage axis of a profile given its mapped vectors. NOT_RUN is an evidence
 * tier, not a coverage value — runner-none vectors are NOT_COVERED here and
 * NOT_RUN on the tier axis (see evidenceTierFromVectors).
 */
function coverageStatus(vectors) {
  const list = Array.isArray(vectors) ? vectors : [];
  const runnable = list.filter((v) => v.runner && v.runner !== 'none');
  if (list.length === 0) return COVERAGE.NOT_COVERED;
  if (runnable.length === 0) return COVERAGE.NOT_COVERED;
  if (!polarityCounts(runnable).complete) return COVERAGE.NOT_COVERED;
  return COVERAGE.COVERED;
}

function evidenceTierFromVectors(vectors) {
  const list = Array.isArray(vectors) ? vectors : [];
  const runnable = list.filter((v) => v.runner && v.runner !== 'none');
  if (runnable.length === 0) return EVIDENCE_TIER.NOT_RUN;
  if (runnable.every((v) => v.runner === 'recorded')) return EVIDENCE_TIER.RECORDED;
  if (runnable.some((v) => v.runner === 'recorded')) return EVIDENCE_TIER.RECORDED;
  return EVIDENCE_TIER.LIVE;
}

function recordedOverlay(mode) {
  const evidence = mode === 'live' ? 'live' : DEFAULT_EVIDENCE;
  if (evidence === 'live') {
    const cryptoLive = require('./recorded-receipt-crypto').liveUnavailable();
    const prove = require('./recorded-prove-profiles');
    return {
      RECEIPT_CRYPTO: cryptoLive,
      CREDENTIAL_BOUNDARY: prove.liveUnavailable('CREDENTIAL_BOUNDARY'),
      ATOMIC_COMMIT: prove.liveUnavailable('ATOMIC_COMMIT'),
    };
  }
  const cryptoRec = require('./recorded-receipt-crypto').evaluate();
  const proveRec = require('./recorded-prove-profiles').evaluate();
  return {
    RECEIPT_CRYPTO: cryptoRec,
    CREDENTIAL_BOUNDARY: proveRec.credential_boundary,
    ATOMIC_COMMIT: proveRec.atomic_commit,
  };
}

const VECTOR_MAP = Object.freeze([
  // ── DECISION_LOGIC ────────────────────────────────────────────────────────
  ...fromCases(['AA-BRANCH-CONTINUE', 'AA-BRANCH-NOT-DECISION', 'AA-BRANCH-NOT-SAFE-FOR-AGENT',
    'AA-BRANCH-REQUEST-APPROVAL', 'AA-BRANCH-STOP', 'AA-UNRECOGNISED-ACTION',
    'AA-MISSING-EXECUTION-ACTION', 'AA-MONITOR-SINK-WIRED', 'AA-MONITOR-SINK-UNWIRED'],
  'DECISION_LOGIC'),
  // next_agent_step (app I-1288) — the issuer now signs a remediation SUGGESTION inside the
  // envelope. These belong to DECISION_LOGIC and nowhere else: what they score is that a
  // consumer still branches on execution_action when a step is present and reads more
  // permissively than the verdict. They prove nothing about the SIGNATURE over that step —
  // that is RECEIPT_CRYPTO's subject, and RECEIPT_CRYPTO does not run here (see why_empty).
  ...fromCases(['AA-NEXT-STEP-NOT-PERMISSION', 'AA-NEXT-STEP-ALLOW-NULL'], 'DECISION_LOGIC'),
  {
    vector: 'ADV-1 issuer collision',
    profile: 'DECISION_LOGIC',
    source: 'test/adversarial.test.js',
    runner: 'test',
    polarity: 'negative',
    note:
      'Placed by evidence, not by subject matter. Its subject is provider enforcement; its evidence '
      + 'is a LOCAL MIRROR of evaluateRequiredCheck, so what it proves is an invariant of a verdict '
      + 'function. See PROVIDER_ENFORCED.why_empty.',
  },
  {
    vector: 'ADV-7 same-issuer workflow spoof',
    profile: 'DECISION_LOGIC',
    source: 'test/adversarial.test.js',
    runner: 'test',
    polarity: 'negative',
    note:
      'PLACED BY EVIDENCE, AND IT DOES NOT POPULATE PROVIDER_ENFORCED. Its subject is the shared '
      + 'github-actions issuer, so the tempting home is PROVIDER_ENFORCED — but what it proves is '
      + 'that the branch-protection schema carries no workflow-identifying field, which is an '
      + 'invariant read offline. It observes no check run and no refusal. Counting it under '
      + 'PROVIDER_ENFORCED would make an empty profile look populated on the strength of a vector '
      + 'that measures a JSON schema.',
  },
  {
    vector: 'ADV-8 create-path read-back payload shape',
    profile: 'DECISION_LOGIC',
    source: 'test/adversarial.test.js',
    runner: 'test',
    polarity: 'negative',
    note:
      'It grades two installer payloads with the same mirror ADV-1 uses, so it is a verdict '
      + 'invariant over a configuration shape. It is NOT evidence about the installer: this suite '
      + 'runs no CLI, so a regressed installer emitting the defective payload again would still be '
      + 'graded unbound here and nothing would flag the change. Recorded in its evidence_checklist.',
  },
  {
    vector: 'model-acceptance 4 providers x allow/block (8 rows)',
    profile: 'DECISION_LOGIC',
    source: 'fixtures/model-acceptance.v1.json',
    runner: 'test',
    polarity: 'pair',
    note:
      'The assertion scored is verdict and change_fp IDENTITY across four provider tool-call shapes '
      + '— a provider-independence invariant of the verdict. The binding helpers are the mechanism, '
      + 'not the claim, so this does not count under GUARDED_TOOL_TABLE.',
  },

  // ── GUARDED_TOOL_TABLE ────────────────────────────────────────────────────
  ...fromCases(['AA-DOCS-ONLY-SKIP', 'AA-CONTRACT-CHANGE-PREFLIGHT', 'AA-RECEIPT-CARRY-VERIFY',
    'AA-RECEIPT-WRONG-SCOPE-REPREFLIGHT', 'AA-AUTHORIZE-NEEDS-OPERATION'],
  'GUARDED_TOOL_TABLE'),
  {
    vector: 'ADV-5 MCP negative schema + tool-description scoping',
    profile: 'GUARDED_TOOL_TABLE',
    source: 'test/adversarial.test.js',
    runner: 'test',
    polarity: 'negative',
  },

]);

/**
 * Vectors that do not fit ANY of the seven, recorded rather than forced into the nearest one.
 * Forcing would put a vector under a profile whose name overclaims what it proves, which is the
 * failure the split exists to prevent — so an unplaceable vector is a finding about the taxonomy.
 */
const UNPLACED = Object.freeze([
  {
    vector: 'ADV-6 action tag mutation (SHA pin vs moving @v0)',
    source: 'test/adversarial.test.js',
    why:
      'It asserts that the strict template pins immutable bytes and the default template follows a '
      + 'moving tag, and that a consumer can tell which they run. That is supply-chain integrity of '
      + 'the enforcing component — a PRECONDITION for provider enforcement, not enforcement, and '
      + 'not a verdict, a token, or a tool. None of the seven names it.',
    proposal:
      'Either widen PROVIDER_ENFORCED into two levels (precondition vs observed) or add a '
      + 'SUPPLY_CHAIN_PIN profile. Not decided here: inventing an eighth profile to hold one vector '
      + 'is how a taxonomy stops meaning anything, and this round was scoped to say what the '
      + 'existing vectors prove.',
  },
]);

/**
 * Suite self-integrity tests. NOT product vectors: they assert that this suite keeps stating its
 * own boundary, so they belong to no profile and must never be counted toward one.
 */
const META_TESTS = Object.freeze({
  count: 10,
  groups: ['COVERAGE BOUNDARY — the four vectors this suite does NOT carry',
    'RE-VERIFICATION RECORD — the vectors pin a FIX, not a snapshot of one'],
  why_not_a_profile:
    'They assert properties of the FIXTURE (that exclusions name a reason, that the README ceiling '
    + 'matches the fixture ceiling, that drift is recorded). Counting them toward a product profile '
    + 'would let the suite raise its own score by describing itself.',
});

/** Build the report: one row per profile, with both axes explicit. */
function buildProfileReport(opts = {}) {
  const evidence = opts.evidence === 'live' ? 'live' : DEFAULT_EVIDENCE;
  const overlay = recordedOverlay(evidence);
  return PROFILES.map((p) => {
    const vectors = VECTOR_MAP.filter((v) => v.profile === p.id);
    const runnable = vectors.filter((v) => v.runner !== 'none');
    const polar = polarityCounts(runnable);
    let coverage = coverageStatus(vectors);
    let evidence_tier = evidenceTierFromVectors(vectors);
    let result = coverage === COVERAGE.COVERED && evidence_tier === EVIDENCE_TIER.LIVE
      ? RESULT.PASS
      : null;
    let why_empty = p.why_empty || null;
    let vector_ids = vectors.map((v) => v.vector);
    let positive = polar.positive;
    let negative = polar.negative;
    let nVectors = vectors.length;
    let nRunnable = runnable.length;
    let does_not_prove = [];
    let gaps = [];

    if (coverage === COVERAGE.NOT_COVERED && vectors.length > 0 && !polar.complete) {
      why_empty = `Runnable vectors exist (${polar.positive} positive, ${polar.negative} negative) `
        + 'but COVERED requires both polarities — a profile with only one half is not covered.';
    }

    const over = overlay[p.id];
    if (over) {
      coverage = over.coverage;
      evidence_tier = over.evidence_tier;
      result = over.result;
      why_empty = over.why_empty || (coverage === COVERAGE.COVERED ? null : why_empty);
      does_not_prove = over.does_not_prove || [];
      gaps = over.gaps || over.missing || [];
      if (Array.isArray(over.vector_ids) && over.vector_ids.length) {
        vector_ids = over.vector_ids;
        nVectors = over.vector_ids.length;
        nRunnable = over.vector_ids.length;
      }
      if (typeof over.positive === 'number') positive = over.positive;
      if (typeof over.negative === 'number') negative = over.negative;
      if (coverage === COVERAGE.PARTIAL) {
        positive = Math.max(positive, 1);
        negative = Math.max(negative, 1);
      }
    }

    const row = {
      id: p.id,
      title: p.title,
      coverage,
      evidence_tier,
      result,
      status: coverage,
      green: isGreen(coverage, evidence_tier),
      vectors: nVectors,
      runnable: nRunnable,
      positive,
      negative,
      asserts: p.asserts,
      does_not: p.does_not || null,
      does_not_prove,
      gaps,
      why_empty,
      vector_ids,
      evidence,
    };
    return row;
  });
}


// ── RENDERING ───────────────────────────────────────────────────────────────
//
// THE DECISION: an empty profile renders as NOT COVERED, never as "0/0".
//
// "0/0" was rejected, and the reason is that it is not merely unclear — it is the SAME SHAPE as a
// pass. "14/14" and "0/0" both read as "everything selected succeeded"; a green tick, a zero
// failure count and a zero exit are indistinguishable between a profile that ran and a profile
// that does not exist. Every totalling tool downstream agrees with that misreading: a dashboard
// summing passes over totals scores 0/0 as 100%, and a reader scanning a column of ratios sees no
// break. The failure mode is silent and it compounds — the profile stays empty precisely because
// nothing ever draws attention to it.
//
// NOT COVERED cannot be misread as a pass because it is not a number at all. A count is only
// printed where a count means something, which is where vectors exist.
//
// The alternative considered and rejected was to omit empty profiles from the output entirely.
// That is worse than 0/0: it removes the evidence that the claim was ever contemplated, so the
// reader learns nothing new and cannot even ask why. The brief's constraint that the README show
// the empty ones is the same principle — a reader who sees only the profiles that pass has been
// told less than one who sees the whole chain with four gaps in it.

/**
 * Guard invoked by BOTH renderers before any output is produced. Rendering a non-COVERED profile
 * as green is not a formatting mistake to be caught in review — it is the defect this whole split
 * exists to prevent, so it throws rather than printing.
 * @param {Array} rows result of buildProfileReport()
 */
function assertNoGreenEmpty(rows) {
  for (const r of rows) {
    const coverage = r.coverage || r.status;
    const tier = r.evidence_tier;
    if (r.green && coverage !== COVERAGE.COVERED) {
      throw new Error(`assurance-profiles: ${r.id} is ${coverage} but marked green — refusing to render`);
    }
    if (r.green && tier === EVIDENCE_TIER.MODELLED) {
      throw new Error(`assurance-profiles: ${r.id} is MODELLED but marked green — refusing to render`);
    }
    if (coverage === COVERAGE.COVERED && tier === EVIDENCE_TIER.MODELLED) {
      throw new Error(`assurance-profiles: ${r.id} MODELLED cannot be COVERED — refusing to render`);
    }
    if (r.green && !isGreen(coverage, tier)) {
      throw new Error(`assurance-profiles: ${r.id} green without LIVE|RECORDED COVERED — refusing to render`);
    }
    if (tier === EVIDENCE_TIER.NOT_RUN && r.runnable > 0 && coverage === COVERAGE.COVERED) {
      throw new Error(`assurance-profiles: ${r.id} is NOT_RUN with COVERED runnable vectors — inconsistent`);
    }
  }
  return rows;
}

/** Soft-wrap prose so a terminal reader sees the reason, not a single unbroken line. */
function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    if (cur && (cur.length + 1 + word.length) > width) { lines.push(cur); cur = word; } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const LABEL = Object.freeze({
  [COVERAGE.COVERED]: 'COVERED',
  [COVERAGE.PARTIAL]: 'PARTIAL',
  [COVERAGE.NOT_COVERED]: 'NOT COVERED',
  [EVIDENCE_TIER.LIVE]: 'LIVE',
  [EVIDENCE_TIER.RECORDED]: 'RECORDED',
  [EVIDENCE_TIER.MODELLED]: 'MODELLED',
  [EVIDENCE_TIER.NOT_RUN]: 'NOT RUN',
});

function overallEvidence(rows) {
  const live = rows.filter((r) => r.evidence_tier === EVIDENCE_TIER.LIVE).length;
  const recorded = rows.filter((r) => r.evidence_tier === EVIDENCE_TIER.RECORDED).length;
  const modelled = rows.filter((r) => r.evidence_tier === EVIDENCE_TIER.MODELLED).length;
  const notRun = rows.filter((r) => r.evidence_tier === EVIDENCE_TIER.NOT_RUN).length;
  const fullLive = live === rows.length;
  let overall = EVIDENCE_TIER.NOT_RUN;
  if (modelled && !recorded && !live) overall = EVIDENCE_TIER.MODELLED;
  else if (recorded) overall = EVIDENCE_TIER.RECORDED;
  else if (live && !recorded) overall = EVIDENCE_TIER.LIVE;
  return { live, recorded, modelled, not_run: notRun, overall, full_live: fullLive };
}

/**
 * Terminal table. The evidence column carries a COUNT only for COVERED profiles; every other
 * status prints words, so there is no ratio anywhere that a reader or a script can total.
 */
function renderProfileTable(rows = buildProfileReport()) {
  assertNoGreenEmpty(rows);
  const out = [];
  out.push('ASSURANCE PROFILES — two axes: coverage × evidence_tier (never conflated)');
  out.push('');
  const w = Math.max(...rows.map((r) => r.id.length));
  for (const r of rows) {
    const coverage = r.coverage || r.status;
    const tier = r.evidence_tier || EVIDENCE_TIER.NOT_RUN;
    let evidence;
    if (coverage === COVERAGE.COVERED && tier === EVIDENCE_TIER.LIVE) {
      evidence = `${r.runnable} vector(s) run now (${r.positive} positive, ${r.negative} negative)`;
    } else if (coverage === COVERAGE.COVERED && tier === EVIDENCE_TIER.RECORDED) {
      evidence = `recorded pair (${r.positive} positive, ${r.negative} negative)`;
    } else if (coverage === COVERAGE.PARTIAL) {
      evidence = `recorded, gaps named (${(r.gaps || []).length} missing)`;
    } else if (tier === EVIDENCE_TIER.NOT_RUN && r.vectors > 0) {
      evidence = `${r.vectors} vector(s) present, NONE executable here`;
    } else if (r.vectors > 0) {
      evidence = `pair incomplete (${r.positive} positive, ${r.negative} negative)`;
    } else {
      evidence = 'no vector exists';
    }
    out.push(
      `  ${LABEL[coverage].padEnd(11)}  ${LABEL[tier].padEnd(9)}  ${r.id.padEnd(w)}  ${evidence}`,
    );
  }
  out.push('');
  const covered = rows.filter((r) => (r.coverage || r.status) === COVERAGE.COVERED).length;
  const partial = rows.filter((r) => r.coverage === COVERAGE.PARTIAL).length;
  const notCovered = rows.filter((r) => (r.coverage || r.status) === COVERAGE.NOT_COVERED).length;
  const ev = overallEvidence(rows);
  // Coverage count is a count of COVERED rows, not a pass-rate over unequal claims.
  // The evidence breakdown is required so 3/7 cannot be read as "almost 7/7 live".
  out.push(
    `  PROFILE COVERAGE ${covered}/${rows.length}`
    + ` · EVIDENCE ${ev.live} LIVE + ${ev.recorded} RECORDED + ${ev.modelled} MODELLED`
    + ` · OVERALL ${ev.overall}`
    + ` · FULL LIVE ${ev.full_live}`,
  );
  out.push(`  ${covered} covered · ${partial} partial · ${notCovered} not covered — of ${rows.length} profiles`);
  out.push('');
  for (const r of rows) {
    const coverage = r.coverage || r.status;
    const recordedCeiling = Array.isArray(r.does_not_prove) && r.does_not_prove.length > 0
      && r.evidence_tier === EVIDENCE_TIER.RECORDED;
    if (coverage === COVERAGE.COVERED && r.green && !recordedCeiling) continue;
    out.push(`  ${r.id} — ${LABEL[coverage]} / ${LABEL[r.evidence_tier || EVIDENCE_TIER.NOT_RUN]}`);
    if (coverage !== COVERAGE.COVERED) {
      for (const line of wrap(r.why_empty || 'vectors exist but no subject here can execute them.', 92)) {
        out.push(`    ${line}`);
      }
    }
    if (recordedCeiling) {
      out.push('    does_not_prove:');
      for (const d of r.does_not_prove) out.push(`      - ${d}`);
    }
    out.push('');
  }
  out.push('CEILING: a passing adversarial vector proves ONE NAMED SHAPE fails at the recorded');
  out.push('version, never that the class is closed. See fixtures/adversarial.v1.json `honesty`.');
  out.push('RECORDED is not LIVE. MODELLED is not COVERED. Conformance never mints evidence.');
  return out.join('\n');
}

/**
 * Machine shape. `green` is emitted explicitly so a consumer never has to infer pass from the
 * absence of a failure count, and `status` is a word rather than a ratio for the same reason.
 */
function renderProfileJson(rows = buildProfileReport()) {
  assertNoGreenEmpty(rows);
  const ev = overallEvidence(rows);
  const covered = rows.filter((r) => (r.coverage || r.status) === COVERAGE.COVERED).length;
  return {
    schema: 'coderifts.conformance.assurance-profiles.v2',
    ceiling:
      'A passing adversarial vector proves ONE NAMED SHAPE fails at the recorded version, never '
      + 'that the class is closed. RECORDED is not LIVE. MODELLED is not COVERED.',
    summary: {
      profiles: rows.length,
      covered,
      partial: rows.filter((r) => r.coverage === COVERAGE.PARTIAL).length,
      not_covered: rows.filter((r) => (r.coverage || r.status) === COVERAGE.NOT_COVERED).length,
      live: ev.live,
      recorded: ev.recorded,
      modelled: ev.modelled,
      not_run: ev.not_run,
      overall_evidence: ev.overall,
      full_live: ev.full_live,
      coverage_line: `${covered}/${rows.length}`,
    },
    profiles: rows.map((r) => ({
      id: r.id,
      title: r.title,
      coverage: r.coverage || r.status,
      evidence_tier: r.evidence_tier,
      result: r.result,
      status: r.coverage || r.status,
      green: r.green,
      vectors_present: r.vectors,
      vectors_runnable: r.runnable,
      vectors_positive: r.positive,
      vectors_negative: r.negative,
      asserts: r.asserts,
      does_not_assert: r.does_not,
      does_not_prove: r.does_not_prove || [],
      gaps: r.gaps || [],
      why_not_covered: r.why_empty,
      vector_ids: r.vector_ids,
    })),
    unplaced_vectors: UNPLACED,
    meta_tests: META_TESTS,
    attack_matrix: {
      ...ATTACK_MATRIX,
      note: 'COVERED-by-execution is recorded by lib/attack-matrix-runner.js. It does not change these profile statuses.',
    },
  };
}

module.exports = {
  STATUS,
  COVERAGE,
  EVIDENCE_TIER,
  RESULT,
  DEFAULT_EVIDENCE,
  isGreen,
  PROFILES,
  PROFILE_IDS,
  VECTOR_MAP,
  UNPLACED,
  META_TESTS,
  ATTACK_MATRIX,
  coverageStatus,
  evidenceTierFromVectors,
  polarityCounts,
  recordedOverlay,
  overallEvidence,
  buildProfileReport,
  assertNoGreenEmpty,
  renderProfileTable,
  renderProfileJson,
  LABEL,
};
