/**
 * OBSERVED bypass-failure — recorded HTTP 405 merge-API bodies.
 *
 * Three claims, kept separate (1370):
 *   1. config-closure     — ruleset bypass_actors:[] (PROVIDER_ENFORCED configuration)
 *   2. gate-block         — PR#4 required-context FAILURE + merge BLOCKED (PROVIDER_ENFORCED COVERED)
 *   3. observed bypass    — THIS FILE. An admin merge attempt was made and the merge API
 *                           returned 405 naming the required context.
 *
 * This is a recorded artifact, not an eighth assurance profile. PROVIDER_ENFORCED coverage
 * does not move because of these bytes.
 *
 * @module @coderifts/conformance/lib/recorded-bypass-attempt
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  CLAIM_VERSION, COVERAGE, EVIDENCE_TIER, RESULT,
  sha256hex, assertValidEnvelope,
} = require('./evidence-envelope');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'recorded', 'bypass-attempt');
const REQUIRED_CONTEXT = 'CodeRifts / contract-gate';
const CLAIM = 'observed_bypass_failure';
const PR4_FILE = 'pr4-merge-refusal.json';
const PR5_FILE = 'pr5-merge-refusal.json';

const DOES_NOT_PROVE = Object.freeze([
  'that the ruleset is currently active — freshness is HISTORICAL (captured 2026-09-05, not proven active today)',
  'captured by a local gh admin token, not a GitHub OIDC-attested runner',
  'that GitHub signed these payloads — they are API dumps, not GitHub-signed objects',
  'that the 405 bodies identify the actor or the PR — they do not; admin is the capture claim in the pin, not a field in the JSON',
  'that PR#5 was refused because the gate failed — its 405 reason is "expected", not "failing"; PROVIDER_ENFORCED records PR#5 as required-context SUCCESS and mergeStateStatus BEHIND. PR#5 is the gate-specificity control, not a gate-refusal',
  'that a gate-SUCCESS + up-to-date merge was observed — it was not. The clean "check green and branch current, merge proceeds" pole is absent',
  'that a non-admin credential is equally gated — only this admin-token attempt was captured',
  'that a [skip coderifts]-style marker was tried — these bodies are merge-API rule violations, not a skip-marker experiment',
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
    throw new Error(`bypass-attempt pin mismatch: ${mismatches.join('; ')} — refusing to score forged evidence`);
  }
  const gotManifest = manifestSha(pin);
  if (gotManifest !== pin.inputs_sha256) {
    throw new Error(`bypass-attempt inputs_sha256 mismatch: pin ${pin.inputs_sha256} bytes ${gotManifest}`);
  }
  if (pin.provenance_from_artifact && pin.provenance_from_artifact.oidc_attested === true) {
    throw new Error('bypass-attempt capture provenance claims OIDC — refused for a local gh dump');
  }
  return pin;
}

/**
 * Parse a GitHub merge-API 405 body.
 * Reason is 'failing' | 'expected' | null. The required context must appear as the
 * quoted check name GitHub puts in the rule-violation message.
 */
function parseRefusal(doc) {
  const status = doc && doc.status != null ? String(doc.status) : null;
  const message = doc && doc.message != null ? String(doc.message) : '';
  const named = message.includes(`Required status check "${REQUIRED_CONTEXT}"`);
  let reason = null;
  if (/\bis failing\b/.test(message)) reason = 'failing';
  else if (/\bis expected\b/.test(message)) reason = 'expected';
  return {
    status,
    message,
    named,
    reason,
    required_context: named ? REQUIRED_CONTEXT : null,
  };
}

function measureRefusals(pr4Doc, pr5Doc) {
  const present = [];
  const missing = [];
  const pr4 = parseRefusal(pr4Doc);
  const pr5 = parseRefusal(pr5Doc);

  const pr4Ok = pr4.status === '405' && pr4.named && pr4.reason === 'failing';
  if (pr4Ok) {
    present.push(
      'PR#4 merge API 405: required CodeRifts / contract-gate is failing — '
      + 'admin merge-attempt refused under enforcement',
    );
  } else {
    if (pr4.status !== '405') missing.push('PR#4 merge-API body is not HTTP 405');
    if (!pr4.named) missing.push('PR#4 405 does not name required context CodeRifts / contract-gate');
    if (pr4.reason !== 'failing') missing.push('PR#4 405 reason is not "failing" (gate refused the merge)');
  }

  const pr5Ok = pr5.status === '405' && pr5.named && pr5.reason === 'expected';
  if (pr5Ok) {
    present.push(
      'PR#5 merge API 405: required CodeRifts / contract-gate is expected — '
      + 'a different reason than PR#4 (gate-specificity control, not a gate-refusal)',
    );
  } else {
    if (pr5.status !== '405') missing.push('PR#5 merge-API body is not HTTP 405');
    if (!pr5.named) missing.push('PR#5 405 does not name required context CodeRifts / contract-gate');
    if (pr5.reason !== 'expected') missing.push('PR#5 405 reason is not "expected" (the positive control)');
  }

  const distinct = Boolean(pr4.reason && pr5.reason && pr4.reason !== pr5.reason);
  if (distinct) {
    present.push('two reasons (failing vs expected) — the block is gate-specific, not "everything blocked"');
  } else {
    missing.push('two reasons must differ (failing vs expected) to prove gate-specificity');
  }

  const coverage = (pr4Ok && pr5Ok && distinct) ? COVERAGE.COVERED
    : ((pr4Ok || pr5Ok) ? COVERAGE.PARTIAL : COVERAGE.NOT_COVERED);

  return {
    coverage,
    present,
    missing,
    refusals: { pr4, pr5 },
  };
}

function evaluate(dir = FIXTURE_DIR) {
  const pin = assertPin(dir);
  const pr4 = readJson(dir, PR4_FILE);
  const pr5 = readJson(dir, PR5_FILE);
  const measured = measureRefusals(pr4.doc, pr5.doc);

  const negHash = sha256hex(pr4.bytes);
  const posHash = sha256hex(pr5.bytes);
  const artifacts = [
    { role: 'negative', sha256: negHash },
    { role: 'positive', sha256: posHash },
  ];

  const envelope = {
    profile: CLAIM,
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
      observed_bypass_failure: 'HISTORICAL',
      not_a_live_observation: true,
    },
    does_not_prove: DOES_NOT_PROVE.slice(),
    signature: {
      alg: 'none',
      binding: 'capture_provenance',
      note: 'GitHub payloads are not GitHub-signed; oidc_attested must stay false',
    },
  };

  const manifest = pin.artifacts.map((a) => `${a.path}=${a.sha256}`).join('\n') + '\n';
  assertValidEnvelope(envelope, {
    attached: [
      { role: 'negative', bytes: pr4.bytes, sha256: negHash },
      { role: 'positive', bytes: pr5.bytes, sha256: posHash },
    ],
    subjectBytes: Buffer.from(manifest),
    verifySignature: () => (
      pin.provenance_from_artifact
      && pin.provenance_from_artifact.oidc_attested === false
        ? { ok: true }
        : { ok: false, error: 'capture provenance missing or overclaims OIDC' }
    ),
    bindings: [
      {
        name: 'pr4-405-failing-required-context',
        ok: measured.refusals.pr4.status === '405'
          && measured.refusals.pr4.reason === 'failing'
          && measured.refusals.pr4.named,
        error: 'PR#4 must be HTTP 405 naming CodeRifts / contract-gate is failing',
      },
      {
        name: 'pr5-405-expected-required-context',
        ok: measured.refusals.pr5.status === '405'
          && measured.refusals.pr5.reason === 'expected'
          && measured.refusals.pr5.named,
        error: 'PR#5 must be HTTP 405 naming CodeRifts / contract-gate is expected',
      },
      {
        name: 'two-reasons-gate-specificity',
        ok: measured.refusals.pr4.reason !== measured.refusals.pr5.reason,
        error: 'failing vs expected must differ — otherwise the block is not shown to be gate-specific',
      },
      {
        name: 'no-oidc-overclaim',
        ok: pin.provenance_from_artifact.oidc_attested === false,
        error: 'oidc_attested must be false for a local gh dump',
      },
    ],
    operational: true,
  });

  const why = measured.coverage === COVERAGE.COVERED
    ? null
    : `RECORDED 405 merge-API bodies ${pin.provenance_from_artifact.run_id}. Present: ${measured.present.join('; ') || 'none'}. Missing: ${measured.missing.join('; ')}.`;

  return {
    claim: CLAIM,
    profile: CLAIM,
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
    refusals: measured.refusals,
    vector_ids: measured.present,
    positive: 1,
    negative: 1,
  };
}

module.exports = {
  FIXTURE_DIR,
  CLAIM,
  REQUIRED_CONTEXT,
  DOES_NOT_PROVE,
  assertPin,
  parseRefusal,
  measureRefusals,
  evaluate,
  manifestSha,
};
