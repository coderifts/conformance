/**
 * PROVIDER_ENFORCED — RECORDED evidence from raw GitHub API dumps.
 *
 * Two poles, never one, on the SAME required context:
 *   positive — required "CodeRifts / contract-gate" SUCCESS (PR#5)
 *   negative — required "CodeRifts / contract-gate" FAILURE + merge BLOCKED (PR#4)
 *
 * A differently-named check ("CodeRifts — API Contract Check") is not this
 * profile's negative pole. mergeStateStatus BEHIND is not a merge-refusal.
 *
 * GitHub payloads are not GitHub-signed. Capture provenance is a local `gh api`
 * dump (oidc_attested:false). The verifier refuses a bundle that claims OIDC.
 *
 * The negative pole was captured as REST (pull + check-runs); the positive pole
 * as GraphQL statusCheckRollup. Both are raw dumps. This module reads each
 * shape; it does not rewrite one into the other.
 *
 * @module @coderifts/conformance/lib/recorded-provider-enforced
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CLAIM_VERSION, COVERAGE, EVIDENCE_TIER, RESULT,
  sha256hex, assertValidEnvelope,
} = require('./evidence-envelope');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'recorded', 'provider-enforced');
const REQUIRED_CONTEXT = 'CodeRifts / contract-gate';
const APP_ID = 2860592;
const RULESET_ID = 22074842;
const NEGATIVE_PR = 4;
const POSITIVE_PR = 5;
const NEGATIVE_HEAD_PREFIX = '4b2062b9';
const POSITIVE_HEAD_PREFIX = 'df76f7a7';

const DOES_NOT_PROVE = Object.freeze([
  'that the ruleset is currently active — freshness is HISTORICAL (was active at observed_at, not proven active today)',
  'that another unmeasured credential holder (bypass_actors / admin) is equally gated',
  'that the configuration today still matches this captured ruleset',
  'captured by a local gh token, not a GitHub OIDC-attested runner',
  'that GitHub signed these payloads — they are API dumps, not GitHub-signed objects',
  'that a merge API call returned 405 — BLOCKED is GitHub merge-state on PR#4, not a captured HTTP merge-refusal body',
  'that the positive pole (PR#5) was merged — it remains mergeStateStatus BEHIND; SUCCESS on the required check is the positive evidence',
  'that the GitHub Actions check "contract-gate (Action)" (app 15368) is the ruleset context — the required context is "CodeRifts / contract-gate" (app 2860592)',
  // 1370 — the distinction auditor-2 asked for, stated as a limit rather than argued away.
  // CONFIG-CLOSURE is what this capture holds: the ruleset is active with bypass_actors:[] and no
  // classic branch protection, so nothing is CONFIGURED to skip the gate. An OBSERVED BYPASS
  // FAILURE is a different, stronger claim, and we do not have it.
  'that a bypass was ATTEMPTED and failed — the negative pole is the gate failing on PR#4, not anyone trying to get around it. bypass_actors:[] is configuration, not an observation',
  'that any merge has occurred under enforcement at all — MEASURED 2026-09-05: zero commits reached main since the ruleset was created (2026-09-02T08:34Z), so the gate has never been exercised by a merge attempt',
  'that the "expected to be REFUSED" canary PRs (#12, #13) are evidence — both MERGED on 2026-08-27, six days BEFORE the ruleset existed; they measure the un-enforced repository and must not be cited here',
  'that a [skip coderifts]-style marker was ever tried — MEASURED 2026-09-05: GitHub code/commit/issue search for "skip" on coderifts/demo returns 0 across titles, bodies and commit messages',
]);

const E2E_DOES_NOT_PROVE = Object.freeze([
  'that decision, receipt, guarded execution, atomic commit and provider enforcement happened on ONE change',
  'that the prove-transcript and the GitHub PRs share a run_id or a commit',
  'a collage of separately recorded layers is layer-coverage, not end-to-end',
]);

function readJson(dir, name) {
  const bytes = fs.readFileSync(path.join(dir, name));
  return { bytes, doc: JSON.parse(bytes.toString('utf8')) };
}

function manifestSha(pin) {
  const lines = pin.artifacts.map((a) => `${a.path}=${a.sha256}`).join('\n') + '\n';
  return `sha256:${sha256hex(lines)}`;
}

function assertPin(dir = FIXTURE_DIR) {
  const pin = JSON.parse(fs.readFileSync(path.join(dir, 'pin.json'), 'utf8'));
  const mismatches = [];
  for (const a of pin.artifacts) {
    const bytes = fs.readFileSync(path.join(dir, a.path));
    const got = sha256hex(bytes);
    if (got !== a.sha256) mismatches.push(`${a.path}: pin ${a.sha256} bytes ${got}`);
  }
  if (mismatches.length) {
    throw new Error(`provider-enforced pin mismatch: ${mismatches.join('; ')} — refusing to score forged evidence`);
  }
  const gotManifest = manifestSha(pin);
  if (gotManifest !== pin.inputs_sha256) {
    throw new Error(`provider-enforced inputs_sha256 mismatch: pin ${pin.inputs_sha256} bytes ${gotManifest}`);
  }
  return pin;
}

function upper(s) {
  return String(s || '').toUpperCase();
}

function graphqlPr(doc) {
  return doc && doc.data && doc.data.repository && doc.data.repository.pullRequest
    ? doc.data.repository.pullRequest
    : null;
}

function checkNodes(pr) {
  const rollup = pr && pr.statusCheckRollup;
  const nodes = rollup && rollup.contexts && rollup.contexts.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function appIdOfGraphql(node) {
  const app = node && node.checkSuite && node.checkSuite.app;
  return app && app.databaseId;
}

function checksFromGraphql(pr) {
  return checkNodes(pr).map((n) => ({
    name: n.name,
    conclusion: upper(n.conclusion),
    status: upper(n.status),
    appId: appIdOfGraphql(n),
  }));
}

function checksFromRest(doc) {
  const runs = doc && Array.isArray(doc.check_runs) ? doc.check_runs : [];
  return runs.map((c) => ({
    name: c.name,
    conclusion: upper(c.conclusion),
    status: upper(c.status),
    appId: c.app && c.app.id,
    headSha: c.head_sha,
  }));
}

/**
 * Normalize a pole from either captured shape.
 * GraphQL: data.repository.pullRequest + statusCheckRollup.
 * REST: pull object (number/head.sha/mergeable_state) + companion check-runs list.
 */
function asPole(prDoc, checksDoc) {
  const gql = graphqlPr(prDoc);
  if (gql) {
    return {
      number: gql.number,
      head: gql.headRefOid,
      mergeStateStatus: gql.mergeStateStatus,
      rollup: gql.statusCheckRollup && gql.statusCheckRollup.state,
      checks: checksFromGraphql(gql),
    };
  }
  if (prDoc && typeof prDoc.number === 'number' && prDoc.head && prDoc.head.sha) {
    return {
      number: prDoc.number,
      head: prDoc.head.sha,
      mergeStateStatus: upper(prDoc.mergeable_state),
      rollup: null,
      checks: checksFromRest(checksDoc),
    };
  }
  return null;
}

function hasRequired(pole, conclusion) {
  return Boolean(
    pole
    && pole.checks.some((c) => (
      c.name === REQUIRED_CONTEXT
      && c.conclusion === conclusion
      && c.appId === APP_ID
    )),
  );
}

function measurePoles(ruleset, negativeDoc, positiveDoc, capture, negativeChecksDoc) {
  const present = [];
  const missing = [];

  const rsOk = ruleset
    && ruleset.id === RULESET_ID
    && ruleset.enforcement === 'active'
    && ruleset.name === 'coderifts-enforcement';
  const req = ((((ruleset || {}).rules || [])[0] || {}).parameters || {}).required_status_checks || [];
  const reqGate = req.some((c) => c.context === REQUIRED_CONTEXT && c.integration_id === APP_ID);
  const refMain = ((((ruleset || {}).conditions || {}).ref_name || {}).include || []).includes('refs/heads/main');
  if (rsOk && reqGate && refMain) {
    present.push('ruleset 22074842 active, contract-gate required, integration_id 2860592, ref main');
  } else missing.push('ruleset raw readback (id/enforcement/required context/integration_id/ref)');

  const n = asPole(negativeDoc, negativeChecksDoc);
  const negative = Boolean(
    n
    && n.number === NEGATIVE_PR
    && String(n.head).startsWith(NEGATIVE_HEAD_PREFIX)
    && n.mergeStateStatus === 'BLOCKED'
    && hasRequired(n, 'FAILURE'),
  );
  if (negative) {
    present.push(
      'PR#4 negative pole: required CodeRifts / contract-gate FAILURE (app 2860592), '
      + 'head 4b2062b9, mergeStateStatus BLOCKED',
    );
  } else {
    missing.push(
      'PR#4 raw negative pole (required context CodeRifts / contract-gate FAILURE + merge BLOCKED)',
    );
  }

  const p = asPole(positiveDoc, null);
  const positive = Boolean(
    p
    && p.number === POSITIVE_PR
    && String(p.head).startsWith(POSITIVE_HEAD_PREFIX)
    && hasRequired(p, 'SUCCESS'),
  );
  if (positive) {
    present.push(
      'PR#5 positive pole: required CodeRifts / contract-gate SUCCESS (app 2860592), head df76f7a7',
    );
  } else {
    missing.push('PR#5 raw positive pole (required context CodeRifts / contract-gate SUCCESS)');
  }

  const provenanceOk = capture
    && capture.oidc_attested === false
    && capture.method === 'gh api'
    && capture.workflow_run_bound === false;
  if (provenanceOk) present.push('capture provenance: local gh api dump, oidc_attested=false, no workflow-run bind');
  else missing.push('honest capture provenance (local gh dump, not OIDC)');

  const overclaim = capture && capture.oidc_attested === true;
  if (overclaim) missing.push('capture claims OIDC attestation — refused');

  const bothPoles = Boolean(negative && positive && rsOk && reqGate && provenanceOk && !overclaim);
  const coverage = bothPoles ? COVERAGE.COVERED
    : ((negative || positive) ? COVERAGE.PARTIAL : COVERAGE.NOT_COVERED);

  return {
    coverage,
    present,
    missing,
    both_poles: bothPoles,
    sub_tiers: {
      configuration_readback: EVIDENCE_TIER.RECORDED,
      negative_enforcement_observation: EVIDENCE_TIER.RECORDED,
      overall: EVIDENCE_TIER.RECORDED,
    },
    poles: {
      negative: n ? {
        number: n.number,
        head: n.head,
        rollup: n.rollup,
        mergeStateStatus: n.mergeStateStatus,
        required_context: REQUIRED_CONTEXT,
        required_conclusion: n.checks
          .filter((c) => c.name === REQUIRED_CONTEXT && c.appId === APP_ID)
          .map((c) => c.conclusion)[0] || null,
      } : null,
      positive: p ? {
        number: p.number,
        head: p.head,
        rollup: p.rollup,
        mergeStateStatus: p.mergeStateStatus,
        required_context: REQUIRED_CONTEXT,
        required_conclusion: p.checks
          .filter((c) => c.name === REQUIRED_CONTEXT && c.appId === APP_ID)
          .map((c) => c.conclusion)[0] || null,
      } : null,
    },
  };
}

function evaluate(dir = FIXTURE_DIR) {
  const pin = assertPin(dir);
  const ruleset = readJson(dir, 'ruleset.json');
  const pr4 = readJson(dir, 'pr-4.json');
  const pr4checks = readJson(dir, 'pr-4-checks.json');
  const pr5 = readJson(dir, 'pr-5.json');
  const capture = readJson(dir, 'capture.json').doc;
  const measured = measurePoles(ruleset.doc, pr4.doc, pr5.doc, capture, pr4checks.doc);

  const posHash = sha256hex(pr5.bytes);
  const negHash = sha256hex(pr4.bytes);
  const checksHash = sha256hex(pr4checks.bytes);
  const artifacts = [
    { role: 'positive', sha256: posHash },
    { role: 'negative', sha256: negHash },
    { role: 'negative', sha256: checksHash },
  ];

  const envelope = {
    profile: 'PROVIDER_ENFORCED',
    coverage: measured.coverage,
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
      configuration_readback: 'HISTORICAL',
      negative_enforcement_observation: 'HISTORICAL',
      not_a_live_observation: true,
    },
    does_not_prove: DOES_NOT_PROVE.slice(),
    signature: {
      alg: 'none',
      binding: 'capture_provenance',
      note: 'GitHub payloads are not GitHub-signed; capture.oidc_attested must stay false',
    },
  };

  assertValidEnvelope(envelope, {
    attached: [
      { role: 'positive', bytes: pr5.bytes, sha256: posHash },
      { role: 'negative', bytes: pr4.bytes, sha256: negHash },
      { role: 'negative', bytes: pr4checks.bytes, sha256: checksHash },
    ],
    subjectBytes: ruleset.bytes,
    verifySignature: () => (capture.oidc_attested === false && capture.method === 'gh api'
      ? { ok: true }
      : { ok: false, error: 'capture provenance missing or overclaims OIDC' }),
    bindings: [
      { name: 'both-poles', ok: measured.both_poles, error: measured.missing.join('; ') },
      { name: 'ruleset-bytes-788', ok: ruleset.bytes.length === 788, error: `ruleset is ${ruleset.bytes.length} bytes` },
      { name: 'no-oidc-overclaim', ok: capture.oidc_attested === false, error: 'oidc_attested must be false for a gh dump' },
      {
        name: 'negative-required-context-blocked',
        ok: Boolean(
          measured.poles.negative
          && measured.poles.negative.number === NEGATIVE_PR
          && measured.poles.negative.mergeStateStatus === 'BLOCKED'
          && measured.poles.negative.required_conclusion === 'FAILURE',
        ),
        error: 'negative pole must be required-context FAILURE with merge BLOCKED',
      },
    ],
    operational: true,
  });

  const why = measured.coverage === COVERAGE.COVERED
    ? null
    : `RECORDED from GitHub dumps ${pin.provenance_from_artifact.run_id}. Present: ${measured.present.join('; ') || 'none'}. Missing: ${measured.missing.join('; ')}.`;

  return {
    profile: 'PROVIDER_ENFORCED',
    coverage: measured.coverage,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: RESULT.PASS,
    green: measured.coverage === COVERAGE.COVERED,
    self_minted: false,
    envelope,
    present: measured.present,
    missing: measured.missing,
    gaps: measured.missing,
    why_empty: why,
    does_not_prove: DOES_NOT_PROVE.slice(),
    producer: pin.producer,
    pin,
    capture,
    sub_tiers: measured.sub_tiers,
    poles: measured.poles,
    vector_ids: measured.present,
    positive: 1,
    negative: 1,
  };
}

function measureEndToEnd(dir = FIXTURE_DIR) {
  const provider = evaluate(dir);
  const provePin = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'recorded', 'prove-transcript', 'pin.json'),
    'utf8',
  ));
  const proveArt = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'recorded', 'prove-transcript', 'transcript.json'),
    'utf8',
  ));
  const p8 = (proveArt.points || []).find((p) => p.n === 8);
  const proveRun = provePin.provenance_from_artifact && provePin.provenance_from_artifact.run_id;
  const providerRun = provider.pin.provenance_from_artifact.run_id;
  const proveDump = JSON.stringify(proveArt);
  const sharesHead = proveDump.includes(NEGATIVE_HEAD_PREFIX) || proveDump.includes(POSITIVE_HEAD_PREFIX);
  const sameRun = proveRun && providerRun && proveRun === providerRun;
  const mergeModelled = p8 && p8.state === 'MODELLED';

  const present = [
    `prove-transcript run_id ${proveRun}`,
    `provider capture run_id ${providerRun}`,
    `POINT 8 merge is ${p8 ? p8.state : 'absent'}`,
  ];
  const missing = [];
  if (!sameRun) missing.push('no shared run_id between prove-transcript and the GitHub capture');
  if (!sharesHead) missing.push('prove-transcript does not name PR#4/PR#5 head SHAs (Postgres executor vs GitHub PRs)');
  if (mergeModelled) missing.push('POINT 8 merge is MODELLED in the prove-transcript — no provider producer was attached to that run');

  const correlated = Boolean(sameRun && sharesHead && !mergeModelled);
  const coverage = correlated ? COVERAGE.COVERED : COVERAGE.PARTIAL;

  return {
    profile: 'END_TO_END',
    coverage,
    evidence_tier: EVIDENCE_TIER.RECORDED,
    result: RESULT.PASS,
    green: coverage === COVERAGE.COVERED,
    self_minted: false,
    envelope: null,
    present,
    missing,
    gaps: missing,
    why_empty:
      `RECORDED_WITH_MODELLED_STEP. Provider enforcement is a separate GitHub observation `
      + `(${providerRun}); the prove-transcript (${proveRun}) is a Postgres executor run whose `
      + `POINT 8 merge is ${p8 ? p8.state : 'absent'}. They do not share a run_id or a commit. `
      + `A collage of separately recorded layers is layer-coverage, not end-to-end.`,
    does_not_prove: E2E_DOES_NOT_PROVE.slice(),
    producer: provider.producer,
    pin: provider.pin,
    vector_ids: present,
    positive: 0,
    negative: 0,
    correlated,
    prove_run_id: proveRun,
    provider_run_id: providerRun,
    point8: p8 || null,
  };
}

function liveUnavailable(profile) {
  const e2e = profile === 'END_TO_END';
  return {
    profile,
    coverage: COVERAGE.NOT_COVERED,
    evidence_tier: EVIDENCE_TIER.NOT_RUN,
    result: null,
    green: false,
    self_minted: false,
    envelope: null,
    gaps: ['live GitHub / correlated e2e infra not available in this process'],
    why_empty:
      `LIVE evidence was requested for ${profile} and this suite does not mint GitHub observations. `
      + 'Without gh credentials and a live provider, the profile is NOT_RUN. '
      + 'It does not fall back to the recorded dumps — that would conflate the two axes.',
    does_not_prove: (e2e ? E2E_DOES_NOT_PROVE : DOES_NOT_PROVE).slice(),
    vector_ids: [],
    positive: 0,
    negative: 0,
  };
}

module.exports = {
  FIXTURE_DIR,
  DOES_NOT_PROVE,
  E2E_DOES_NOT_PROVE,
  REQUIRED_CONTEXT,
  APP_ID,
  RULESET_ID,
  NEGATIVE_PR,
  POSITIVE_PR,
  assertPin,
  measurePoles,
  evaluate,
  measureEndToEnd,
  liveUnavailable,
  manifestSha,
  asPole,
};
