'use strict';

/**
 * OBSERVED bypass-failure — HTTP 405 merge-API bodies, distinct from
 * PROVIDER_ENFORCED's gate-block (PR#4 check FAILURE) and config-closure (bypass_actors:[]).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BA = require('../lib/recorded-bypass-attempt');
const PE = require('../lib/recorded-provider-enforced');
const { COVERAGE, EVIDENCE_TIER } = require('../lib/evidence-envelope');
const AP = require('../lib/assurance-profiles');

const BUNDLE = ['pin.json', 'pr4-merge-refusal.json', 'pr5-merge-refusal.json'];
const PR4_SHA = '8408d3d4dfe1179efc56111844ac2f90688a1f44a29518559c750bf149927c3a';
const PR5_SHA = '1e850861ed0830091a00d0fa4619ee482886d94a3491041df312a6032f06d1df';
const REQUIRED = 'CodeRifts / contract-gate';

function copyBundle(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of BUNDLE) {
    fs.copyFileSync(path.join(BA.FIXTURE_DIR, f), path.join(dest, f));
  }
}

describe('observed bypass-attempt recorded 405 bodies', () => {
  it('pin matches the captured bytes verbatim (role bypass_attempt)', () => {
    const pin = BA.assertPin();
    assert.equal(pin.schema, 'cr.conformance.recorded-pin.v1');
    assert.equal(pin.claim, 'observed_bypass_failure');
    const pr4 = pin.artifacts.find((a) => a.path === 'pr4-merge-refusal.json');
    const pr5 = pin.artifacts.find((a) => a.path === 'pr5-merge-refusal.json');
    assert.equal(pr4.role, 'bypass_attempt');
    assert.equal(pr5.role, 'bypass_attempt');
    assert.equal(pr4.sha256, PR4_SHA);
    assert.equal(pr5.sha256, PR5_SHA);
    assert.equal(pr4.bytes, 230);
    assert.equal(pr5.bytes, 231);
    assert.equal(fs.statSync(path.join(BA.FIXTURE_DIR, 'pr4-merge-refusal.json')).size, 230);
    assert.equal(fs.statSync(path.join(BA.FIXTURE_DIR, 'pr5-merge-refusal.json')).size, 231);
    assert.equal(pin.provenance_from_artifact.freshness, 'HISTORICAL');
    assert.equal(pin.provenance_from_artifact.oidc_attested, false);
  });

  it('evaluate is COVERED / RECORDED: 405 names the required context; two reasons differ', () => {
    const out = BA.evaluate();
    assert.equal(out.coverage, COVERAGE.COVERED);
    assert.equal(out.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(out.green, true);
    assert.equal(out.self_minted, false);
    assert.equal(out.claim, 'observed_bypass_failure');
    assert.equal(out.refusals.pr4.status, '405');
    assert.equal(out.refusals.pr4.reason, 'failing');
    assert.equal(out.refusals.pr4.required_context, REQUIRED);
    assert.match(out.refusals.pr4.message, /CodeRifts \/ contract-gate" is failing/);
    assert.equal(out.refusals.pr5.status, '405');
    assert.equal(out.refusals.pr5.reason, 'expected');
    assert.equal(out.refusals.pr5.required_context, REQUIRED);
    assert.match(out.refusals.pr5.message, /CodeRifts \/ contract-gate" is expected/);
    assert.notEqual(out.refusals.pr4.reason, out.refusals.pr5.reason);
    assert.ok(out.present.some((p) => /failing/.test(p) && /405/.test(p)));
    assert.ok(out.present.some((p) => /expected/.test(p)));
    assert.ok(out.present.some((p) => /gate-specific/.test(p) || /two reasons/.test(p)));
  });

  it('does_not_prove is honest: HISTORICAL, local gh, PR#5 is not a gate-refusal, no up-to-date SUCCESS merge', () => {
    const out = BA.evaluate();
    assert.ok(out.does_not_prove.length >= 4);
    assert.ok(out.does_not_prove.some((d) => /HISTORICAL/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /local gh/.test(d) || /OIDC/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /PR#5/.test(d) && /BEHIND|expected|not a gate-refusal/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /up-to-date|SUCCESS \+ .*merge|merge succeeded/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /actor|admin/.test(d)));
  });

  it('this is not an eighth assurance profile — PROVIDER_ENFORCED coverage is unchanged', () => {
    assert.equal(AP.PROFILE_IDS.includes('observed_bypass_failure'), false);
    assert.equal(AP.PROFILE_IDS.includes('OBSERVED_BYPASS_FAILURE'), false);
    const pe = PE.evaluate();
    assert.equal(pe.coverage, COVERAGE.COVERED);
    assert.equal(pe.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(pe.poles.negative.required_conclusion, 'FAILURE');
    assert.equal(pe.poles.negative.mergeStateStatus, 'BLOCKED');
  });

  it('digest-pin mismatch errors — hash-verify, not a silent rescore', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-ba-pin-'));
    copyBundle(tmp);
    const pin = JSON.parse(fs.readFileSync(path.join(tmp, 'pin.json'), 'utf8'));
    pin.artifacts = pin.artifacts.map((a) => (
      a.path === 'pr4-merge-refusal.json' ? { ...a, sha256: '0'.repeat(64) } : a
    ));
    fs.writeFileSync(path.join(tmp, 'pin.json'), JSON.stringify(pin));
    assert.throws(() => BA.assertPin(tmp), /pin mismatch/);
  });

  it('tampering the PR#4 405 body fails the pin', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-ba-gap-'));
    copyBundle(tmp);
    const forged = JSON.parse(fs.readFileSync(path.join(tmp, 'pr4-merge-refusal.json'), 'utf8'));
    forged.status = '200';
    fs.writeFileSync(path.join(tmp, 'pr4-merge-refusal.json'), JSON.stringify(forged));
    assert.throws(() => BA.evaluate(tmp), /pin mismatch/);
  });

  it('measureRefusals without a failing-reason 405 is PARTIAL and names the gap', () => {
    const pr4 = { status: '405', message: 'Repository rule violations found\n\nRequired status check "CodeRifts / contract-gate" is expected.\n\n' };
    const pr5 = JSON.parse(fs.readFileSync(path.join(BA.FIXTURE_DIR, 'pr5-merge-refusal.json'), 'utf8'));
    const m = BA.measureRefusals(pr4, pr5);
    assert.equal(m.coverage, COVERAGE.PARTIAL);
    assert.ok(m.missing.some((g) => /failing/.test(g)));
  });

  it('measureRefusals with identical reasons is PARTIAL — gate-specificity needs both reasons', () => {
    const pr4 = JSON.parse(fs.readFileSync(path.join(BA.FIXTURE_DIR, 'pr4-merge-refusal.json'), 'utf8'));
    const pr5 = { ...JSON.parse(fs.readFileSync(path.join(BA.FIXTURE_DIR, 'pr4-merge-refusal.json'), 'utf8')) };
    const m = BA.measureRefusals(pr4, pr5);
    assert.equal(m.coverage, COVERAGE.PARTIAL);
    assert.ok(m.missing.some((g) => /two reasons|gate-specific|differ/.test(g)));
  });

  it('a 405 that does not name the required context is not this claim', () => {
    const pr4 = { status: '405', message: 'Repository rule violations found\n\nRequired status check "something else" is failing.\n\n' };
    const pr5 = JSON.parse(fs.readFileSync(path.join(BA.FIXTURE_DIR, 'pr5-merge-refusal.json'), 'utf8'));
    const m = BA.measureRefusals(pr4, pr5);
    assert.notEqual(m.coverage, COVERAGE.COVERED);
    assert.ok(m.missing.some((g) => /CodeRifts \/ contract-gate/.test(g)));
  });
});
