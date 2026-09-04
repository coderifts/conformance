/**
 * PROVIDER_ENFORCED — RECORDED evidence from raw GitHub API dumps.
 *
 * Two poles, never one: a SUCCESS check (rule satisfied) and a FAILURE check
 * (provider gated). Configuration read-back alone is not this profile — ADV-1
 * already lives under DECISION_LOGIC for that reason.
 *
 * GitHub payloads are not GitHub-signed. Capture provenance is a local `gh api`
 * dump (oidc_attested:false). The verifier refuses a bundle that claims OIDC.
 *
 * Sub-tiers (honest split):
 *   configuration_readback            RECORDED (vendored ruleset GET; would be
 *                                     LIVE only under --evidence live + gh)
 *   negative_enforcement_observation  RECORDED (captured FAILURE)
 *   overall                           RECORDED
 *
 * END_TO_END is measured here too: a collage of this bundle and the
 * prove-transcript is layer coverage, not one correlated run.
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
const NEGATIVE_CHECK = 'CodeRifts — API Contract Check';

const DOES_NOT_PROVE = Object.freeze([
  'that the ruleset is currently active — freshness is HISTORICAL',
  'that another unmeasured credential holder (bypass_actors / admin) is equally gated',
  'that the configuration today still matches this captured ruleset',
  'captured by a local gh token, not a GitHub OIDC-attested runner',
  'that GitHub signed these payloads — they are API dumps, not GitHub-signed objects',
  'that merge was refused (405) — both poles are mergeStateStatus BEHIND; the CHECK verdict is the evidence, not the merge button',
  'that PR#10\'s failing check is the ruleset\'s required context "CodeRifts / contract-gate" — that head records "CodeRifts — API Contract Check" FAILURE (same app 2860592, different check name)',
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

function pullRequest(doc) {
  return doc && doc.data && doc.data.repository && doc.data.repository.pullRequest;
}

function checkNodes(pr) {
  const rollup = pr && pr.statusCheckRollup;
  const nodes = rollup && rollup.contexts && rollup.contexts.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

function appIdOf(node) {
  const app = node && node.checkSuite && node.checkSuite.app;
  return app && app.databaseId;
}

function measurePoles(ruleset, pr10, pr5, capture) {
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

  const n = pullRequest(pr10);
  const nNodes = checkNodes(n);
  const negative = n
    && n.number === 10
    && String(n.headRefOid).startsWith('146f19c9')
    && n.statusCheckRollup && n.statusCheckRollup.state === 'FAILURE'
    && nNodes.some((c) => c.name === NEGATIVE_CHECK && c.conclusion === 'FAILURE' && appIdOf(c) === APP_ID);
  if (negative) {
    present.push('PR#10 negative pole: API Contract Check FAILURE (app 2860592), head 146f19c9, rollup FAILURE');
  } else missing.push('PR#10 raw negative pole (number/head/statusCheckRollup FAILURE)');

  const p = pullRequest(pr5);
  const pNodes = checkNodes(p);
  const positive = p
    && p.number === 5
    && String(p.headRefOid).startsWith('df76f7a7')
    && p.statusCheckRollup && p.statusCheckRollup.state === 'SUCCESS'
    && pNodes.some((c) => c.name === REQUIRED_CONTEXT && c.conclusion === 'SUCCESS' && appIdOf(c) === APP_ID)
    && pNodes.some((c) => c.name === NEGATIVE_CHECK && c.conclusion === 'SUCCESS' && appIdOf(c) === APP_ID);
  if (positive) {
    present.push('PR#5 positive pole: contract-gate SUCCESS + API Contract Check SUCCESS (app 2860592), head df76f7a7, rollup SUCCESS');
  } else missing.push('PR#5 raw positive pole (number/head/statusCheckRollup SUCCESS with both checks)');

  const behind = (n && n.mergeStateStatus === 'BEHIND') && (p && p.mergeStateStatus === 'BEHIND');
  if (behind) present.push('both poles mergeStateStatus BEHIND — check verdict is the evidence, not the merge button');

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
    merge_state_behind: behind,
    sub_tiers: {
      configuration_readback: EVIDENCE_TIER.RECORDED,
      negative_enforcement_observation: EVIDENCE_TIER.RECORDED,
      overall: EVIDENCE_TIER.RECORDED,
    },
    poles: {
      negative: n ? { number: n.number, head: n.headRefOid, rollup: n.statusCheckRollup && n.statusCheckRollup.state, mergeStateStatus: n.mergeStateStatus } : null,
      positive: p ? { number: p.number, head: p.headRefOid, rollup: p.statusCheckRollup && p.statusCheckRollup.state, mergeStateStatus: p.mergeStateStatus } : null,
    },
  };
}

function evaluate(dir = FIXTURE_DIR) {
  const pin = assertPin(dir);
  const ruleset = readJson(dir, 'ruleset.json');
  const pr10 = readJson(dir, 'pr-10.json');
  const pr5 = readJson(dir, 'pr-5.json');
  const capture = readJson(dir, 'capture.json').doc;
  const measured = measurePoles(ruleset.doc, pr10.doc, pr5.doc, capture);

  const posHash = sha256hex(pr5.bytes);
  const negHash = sha256hex(pr10.bytes);
  const artifacts = [
    { role: 'positive', sha256: posHash },
    { role: 'negative', sha256: negHash },
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
      { role: 'negative', bytes: pr10.bytes, sha256: negHash },
    ],
    subjectBytes: ruleset.bytes,
    verifySignature: () => (capture.oidc_attested === false && capture.method === 'gh api'
      ? { ok: true }
      : { ok: false, error: 'capture provenance missing or overclaims OIDC' }),
    bindings: [
      { name: 'both-poles', ok: measured.both_poles, error: measured.missing.join('; ') },
      { name: 'ruleset-bytes-788', ok: ruleset.bytes.length === 788, error: `ruleset is ${ruleset.bytes.length} bytes` },
      { name: 'no-oidc-overclaim', ok: capture.oidc_attested === false, error: 'oidc_attested must be false for a gh dump' },
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
  const sharesHead = proveDump.includes('146f19c9') || proveDump.includes('df76f7a7');
  const sameRun = proveRun && providerRun && proveRun === providerRun;
  const mergeModelled = p8 && p8.state === 'MODELLED';

  const present = [
    `prove-transcript run_id ${proveRun}`,
    `provider capture run_id ${providerRun}`,
    `POINT 8 merge is ${p8 ? p8.state : 'absent'}`,
  ];
  const missing = [];
  if (!sameRun) missing.push('no shared run_id between prove-transcript and the GitHub capture');
  if (!sharesHead) missing.push('prove-transcript does not name PR#5/PR#10 head SHAs (Postgres executor vs GitHub PRs)');
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
  assertPin,
  measurePoles,
  evaluate,
  measureEndToEnd,
  liveUnavailable,
  manifestSha,
};
