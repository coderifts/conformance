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
 * THE THREE STATES, and the middle one is the reason this file is not just a table:
 *   COVERED     — vectors exist, a subject can execute them, and they run in `npm test`.
 *   NOT_RUN     — vectors EXIST but nothing here can execute them. Data without a runner.
 *   NOT_COVERED — no vector exists at all.
 * NOT_RUN was added because measuring found it, not because the taxonomy predicted it: 19 of the
 * 33 cases in cases.v1.json are vendored from the app and every shipped subject throws
 * `unknown case kind` on them. They are never selected by the default profile, so they never
 * appeared as failures — they simply were not there. A two-state model would have had to call
 * that either COVERED (false) or NOT_COVERED (also false, the vectors are right there in the
 * file). Naming the third state is the honest option.
 *
 * NOTHING HERE RE-STATES A VECTOR'S OWN CEILING. Each vector keeps its own does-not-assert text.
 * The suite-wide ceiling is unchanged and lives in fixtures/adversarial.v1.json `honesty`:
 * a passing adversarial vector proves ONE NAMED SHAPE fails at the recorded version, never that
 * the class is closed.
 *
 * @module @coderifts/conformance/lib/assurance-profiles
 */
'use strict';

const STATUS = Object.freeze({
  COVERED: 'COVERED',
  NOT_RUN: 'NOT_RUN',
  NOT_COVERED: 'NOT_COVERED',
});

/** A status that must never render as a pass, in any format. */
function isGreen(status) {
  return status === STATUS.COVERED;
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
      'The 19 vectors are VENDORED FROM THE APP AND CANNOT RUN HERE. Every shipped subject '
      + 'implements only the `decide` and `tool_selection` kinds and throws `unknown case kind` on '
      + '`execution_grant`, `execution_attestation` and `monitoring_attestation`. They are also '
      + 'excluded from the default profile, so they were never selected and therefore never '
      + 'appeared as failures — the case file simply carried 19 rows nobody executed. Running them '
      + 'needs a verifier subject, which this round did not add (no new vectors). Until then this '
      + 'profile is data, not evidence, and it must not be read as coverage. '
      + 'MEASURED 2026-08-27 (1115) — THE RECOMMENDATION IS REMOVAL, NOT A RUNNER. The inputs carry '
      + 'a scenario NAME, not a token: 14 of the 19 are `{scenario}` and nothing else, so executing '
      + 'them means MINTING the token from that name. A runner here would be a generator and a '
      + 'verifier in one repository agreeing with itself, which measures nothing about the product. '
      + 'receipt-verifier runs the equivalent vectors as SIGNED TOKEN BYTES (ephemeral key, '
      + 'public_key_pem in the document) cross-checked by two independent implementations, JS and '
      + 'Python — that is a real claim. 12 of the 19 already run there under BYTE-IDENTICAL IDS '
      + '(EG-* 5/5, EG-A-* 7/7); the 7 MON-A-* have no home there yet and belong there, not here. '
      + 'REMOVAL CANNOT START IN THIS REPOSITORY: cases.v1.json is vendored from the app and gated '
      + 'byte-identical by the app\'s test/conformance-cases-vendored-sync.test.js, so deleting '
      + 'these rows here would break the app CI. The change begins at the app-canonical copy.',
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
      'A property of a RUNNING host\'s tool table, not of a decision response. Every subject here is '
      + 'a pure function of case input with no host, so any vector would score a FAKE host — and a '
      + 'passing fake would imply this suite covers raw-host bypass when it does not. Recorded in '
      + 'fixtures/adversarial.v1.json as the excluded vector `raw_tool_beside_guarded_table`. '
      + 'Covered by @coderifts/bypass-probe, run against the adopter\'s own installation.',
  },
  {
    id: 'ATOMIC_COMMIT',
    title: 'Nonce + CAS + attestation as one transaction',
    asserts:
      'A claim and the mutation it authorises either both happen or neither does, and a replayed '
      + 'nonce cannot buy a second commit.',
    does_not: null,
    why_empty:
      'Single-use consumption happens at an executor this suite does not run, and the public receipt '
      + 'verifier is STATELESS — it cannot detect a replayed jti by construction, so a vector '
      + 'asserting "replay is rejected" would assert a control the public code does not implement. '
      + 'Recorded as the excluded vectors `stale_nonce` and `concurrent_grants`. NOTE THE TRAP: '
      + 'EG-A-STATE-NONCE-MISMATCH names a nonce and is NOT evidence here — it checks that an '
      + 'attestation document is unbound, which is a binding fact, and it counts under '
      + 'RECEIPT_CRYPTO.',
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
const VECTOR_MAP = Object.freeze([
  // ── DECISION_LOGIC ────────────────────────────────────────────────────────
  ...['AA-BRANCH-CONTINUE', 'AA-BRANCH-NOT-DECISION', 'AA-BRANCH-NOT-SAFE-FOR-AGENT',
    'AA-BRANCH-REQUEST-APPROVAL', 'AA-BRANCH-STOP', 'AA-UNRECOGNISED-ACTION',
    'AA-MISSING-EXECUTION-ACTION', 'AA-MONITOR-SINK-WIRED', 'AA-MONITOR-SINK-UNWIRED']
    .map((id) => ({ vector: id, profile: 'DECISION_LOGIC', source: 'cases.v1.json', runner: 'subject' })),
  {
    vector: 'ADV-1 issuer collision',
    profile: 'DECISION_LOGIC',
    source: 'test/adversarial.test.js',
    runner: 'test',
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
    note:
      'The assertion scored is verdict and change_fp IDENTITY across four provider tool-call shapes '
      + '— a provider-independence invariant of the verdict. The binding helpers are the mechanism, '
      + 'not the claim, so this does not count under GUARDED_TOOL_TABLE.',
  },

  // ── GUARDED_TOOL_TABLE ────────────────────────────────────────────────────
  ...['AA-DOCS-ONLY-SKIP', 'AA-CONTRACT-CHANGE-PREFLIGHT', 'AA-RECEIPT-CARRY-VERIFY',
    'AA-RECEIPT-WRONG-SCOPE-REPREFLIGHT', 'AA-AUTHORIZE-NEEDS-OPERATION']
    .map((id) => ({ vector: id, profile: 'GUARDED_TOOL_TABLE', source: 'cases.v1.json', runner: 'subject' })),
  {
    vector: 'ADV-5 MCP negative schema + tool-description scoping',
    profile: 'GUARDED_TOOL_TABLE',
    source: 'test/adversarial.test.js',
    runner: 'test',
  },

  // ── RECEIPT_CRYPTO — vectors exist, nothing here runs them ────────────────
  ...['EG-VALID', 'EG-EXPIRED', 'EG-WRONG-AUDIENCE', 'EG-SCOPE-MISMATCH', 'EG-UNBOUND-DIGEST']
    .map((id) => ({ vector: id, profile: 'RECEIPT_CRYPTO', source: 'cases.v1.json', runner: 'none' })),
  ...['EG2-VALID', 'EG2-TRANSFERRED-EXECUTOR', 'EG2-TARGET-MISMATCH', 'EG2-AUDIENCE-MISMATCH']
    .map((id) => ({ vector: id, profile: 'RECEIPT_CRYPTO', source: 'cases.v1.json', runner: 'none' })),
  ...['EG-A-VALID', 'EG-A-BAD-SIG', 'EG-A-UNKNOWN-KID', 'EG-A-RETIRED-KEY-VALID-AT-ISSUE',
    'EG-A-MALFORMED', 'EG-A-UNBOUND-JTI', 'EG-A-STATE-NONCE-MISMATCH']
    .map((id) => ({ vector: id, profile: 'RECEIPT_CRYPTO', source: 'cases.v1.json', runner: 'none' })),
  ...['MON-A-VALID', 'MON-A-BAD-SIG', 'MON-A-UNKNOWN-KID', 'MON-A-RETIRED-KEY-VALID-AT-ISSUE',
    'MON-A-MALFORMED', 'MON-A-UNBOUND', 'MON-A-NOT-DELIVERED']
    .map((id) => ({ vector: id, profile: 'RECEIPT_CRYPTO', source: 'cases.v1.json', runner: 'none' })),
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

/** Build the report: one row per profile, with an explicit status. */
function buildProfileReport() {
  return PROFILES.map((p) => {
    const vectors = VECTOR_MAP.filter((v) => v.profile === p.id);
    const runnable = vectors.filter((v) => v.runner !== 'none');
    let status;
    if (vectors.length === 0) status = STATUS.NOT_COVERED;
    else if (runnable.length === 0) status = STATUS.NOT_RUN;
    else status = STATUS.COVERED;
    return {
      id: p.id,
      title: p.title,
      status,
      green: isGreen(status),
      vectors: vectors.length,
      runnable: runnable.length,
      asserts: p.asserts,
      does_not: p.does_not || null,
      why_empty: p.why_empty || null,
      vector_ids: vectors.map((v) => v.vector),
    };
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
    if (r.green && r.status !== STATUS.COVERED) {
      throw new Error(`assurance-profiles: ${r.id} is ${r.status} but marked green — refusing to render`);
    }
    if (r.status !== STATUS.COVERED && r.runnable > 0) {
      throw new Error(`assurance-profiles: ${r.id} is ${r.status} with ${r.runnable} runnable vectors — inconsistent`);
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
  [STATUS.COVERED]: 'COVERED',
  [STATUS.NOT_RUN]: 'NOT RUN',
  [STATUS.NOT_COVERED]: 'NOT COVERED',
});

/**
 * Terminal table. The evidence column carries a COUNT only for COVERED profiles; every other
 * status prints words, so there is no ratio anywhere that a reader or a script can total.
 */
function renderProfileTable(rows = buildProfileReport()) {
  assertNoGreenEmpty(rows);
  const out = [];
  out.push('ASSURANCE PROFILES — what this suite proves, split seven ways');
  out.push('');
  const w = Math.max(...rows.map((r) => r.id.length));
  for (const r of rows) {
    let evidence;
    if (r.status === STATUS.COVERED) evidence = `${r.runnable} vector(s) run`;
    else if (r.status === STATUS.NOT_RUN) evidence = `${r.vectors} vector(s) present, NONE executable here`;
    else evidence = 'no vector exists';
    out.push(`  ${LABEL[r.status].padEnd(11)}  ${r.id.padEnd(w)}  ${evidence}`);
  }
  out.push('');
  const covered = rows.filter((r) => r.status === STATUS.COVERED).length;
  const notRun = rows.filter((r) => r.status === STATUS.NOT_RUN).length;
  const notCovered = rows.filter((r) => r.status === STATUS.NOT_COVERED).length;
  // Deliberately NOT "x/7 passed". The profiles are claims of different strength; a ratio over
  // them would re-create the single number this split replaced.
  out.push(`  ${covered} covered · ${notRun} not run · ${notCovered} not covered — of ${rows.length} profiles`);
  out.push('');
  for (const r of rows) {
    if (r.status === STATUS.COVERED) continue;
    out.push(`  ${r.id} — ${LABEL[r.status]}`);
    for (const line of wrap(r.why_empty || 'vectors exist but no subject here can execute them.', 92)) {
      out.push(`    ${line}`);
    }
    out.push('');
  }
  out.push('CEILING: a passing adversarial vector proves ONE NAMED SHAPE fails at the recorded');
  out.push('version, never that the class is closed. See fixtures/adversarial.v1.json `honesty`.');
  return out.join('\n');
}

/**
 * Machine shape. `green` is emitted explicitly so a consumer never has to infer pass from the
 * absence of a failure count, and `status` is a word rather than a ratio for the same reason.
 */
function renderProfileJson(rows = buildProfileReport()) {
  assertNoGreenEmpty(rows);
  return {
    schema: 'coderifts.conformance.assurance-profiles.v1',
    ceiling:
      'A passing adversarial vector proves ONE NAMED SHAPE fails at the recorded version, never '
      + 'that the class is closed.',
    // No suite-wide pass/total: seven claims of different strength do not sum.
    summary: {
      profiles: rows.length,
      covered: rows.filter((r) => r.status === STATUS.COVERED).length,
      not_run: rows.filter((r) => r.status === STATUS.NOT_RUN).length,
      not_covered: rows.filter((r) => r.status === STATUS.NOT_COVERED).length,
    },
    profiles: rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      green: r.green,
      vectors_present: r.vectors,
      vectors_runnable: r.runnable,
      asserts: r.asserts,
      does_not_assert: r.does_not,
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
  isGreen,
  PROFILES,
  PROFILE_IDS,
  VECTOR_MAP,
  UNPLACED,
  META_TESTS,
  ATTACK_MATRIX,
  buildProfileReport,
  assertNoGreenEmpty,
  renderProfileTable,
  renderProfileJson,
  LABEL,
};
