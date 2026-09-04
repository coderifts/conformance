'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PE = require('../lib/recorded-provider-enforced');
const { COVERAGE, EVIDENCE_TIER } = require('../lib/evidence-envelope');

function copyBundle(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of ['pin.json', 'capture.json', 'ruleset.json', 'pr-10.json', 'pr-5.json']) {
    fs.copyFileSync(path.join(PE.FIXTURE_DIR, f), path.join(dest, f));
  }
}

describe('PROVIDER_ENFORCED recorded GitHub dumps', () => {
  it('pin matches the vendored ruleset (788 bytes) and both PR poles', () => {
    const pin = PE.assertPin();
    const ruleset = pin.artifacts.find((a) => a.path === 'ruleset.json');
    assert.equal(ruleset.sha256, '363ae6b995b7cfa9be6c290f63a3699d06a1fec32fc892014ceb0056b39cd8af');
    assert.equal(ruleset.bytes, 788);
    assert.equal(fs.statSync(path.join(PE.FIXTURE_DIR, 'ruleset.json')).size, 788);
  });

  it('evaluate is COVERED / RECORDED with both poles and honest capture provenance', () => {
    const out = PE.evaluate();
    assert.equal(out.coverage, COVERAGE.COVERED);
    assert.equal(out.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(out.green, true);
    assert.equal(out.self_minted, false);
    assert.equal(out.capture.oidc_attested, false);
    assert.equal(out.capture.method, 'gh api');
    assert.equal(out.capture.workflow_run_bound, false);
    assert.equal(out.sub_tiers.configuration_readback, EVIDENCE_TIER.RECORDED);
    assert.equal(out.sub_tiers.negative_enforcement_observation, EVIDENCE_TIER.RECORDED);
    assert.equal(out.sub_tiers.overall, EVIDENCE_TIER.RECORDED);
    assert.ok(out.does_not_prove.some((d) => /local gh token/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /BEHIND/.test(d)));
    assert.ok(out.does_not_prove.some((d) => /OIDC/.test(d) || /OIDC-attested/.test(d)));
  });

  it('negative pole is PR#10 API Contract Check FAILURE on 146f19c9', () => {
    const out = PE.evaluate();
    assert.equal(out.poles.negative.number, 10);
    assert.equal(out.poles.negative.head.startsWith('146f19c9'), true);
    assert.equal(out.poles.negative.rollup, 'FAILURE');
    assert.equal(out.poles.negative.mergeStateStatus, 'BEHIND');
  });

  it('positive pole is PR#5 contract-gate + API Contract Check SUCCESS on df76f7a7', () => {
    const out = PE.evaluate();
    assert.equal(out.poles.positive.number, 5);
    assert.equal(out.poles.positive.head.startsWith('df76f7a7'), true);
    assert.equal(out.poles.positive.rollup, 'SUCCESS');
    assert.equal(out.poles.positive.mergeStateStatus, 'BEHIND');
  });

  it('digest-pin mismatch errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-pe-pin-'));
    copyBundle(tmp);
    const pin = JSON.parse(fs.readFileSync(path.join(tmp, 'pin.json'), 'utf8'));
    pin.artifacts = pin.artifacts.map((a) => (
      a.path === 'pr-10.json' ? { ...a, sha256: '0'.repeat(64) } : a
    ));
    fs.writeFileSync(path.join(tmp, 'pin.json'), JSON.stringify(pin));
    assert.throws(() => PE.assertPin(tmp), /pin mismatch/);
  });

  it('tampering a pole\'s bytes fails the pin — hash-verify, not a silent rescore', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-pe-gap-'));
    copyBundle(tmp);
    const forged = JSON.parse(fs.readFileSync(path.join(tmp, 'pr-10.json'), 'utf8'));
    forged.data.repository.pullRequest.statusCheckRollup.state = 'SUCCESS';
    forged.data.repository.pullRequest.statusCheckRollup.contexts.nodes[0].conclusion = 'SUCCESS';
    fs.writeFileSync(path.join(tmp, 'pr-10.json'), JSON.stringify(forged));
    assert.throws(() => PE.evaluate(tmp), /pin mismatch/);
  });

  it('measurePoles without a FAILURE pole is PARTIAL and names the gap', () => {
    const ruleset = JSON.parse(fs.readFileSync(path.join(PE.FIXTURE_DIR, 'ruleset.json'), 'utf8'));
    const pr10 = JSON.parse(fs.readFileSync(path.join(PE.FIXTURE_DIR, 'pr-10.json'), 'utf8'));
    const pr5 = JSON.parse(fs.readFileSync(path.join(PE.FIXTURE_DIR, 'pr-5.json'), 'utf8'));
    const capture = JSON.parse(fs.readFileSync(path.join(PE.FIXTURE_DIR, 'capture.json'), 'utf8'));
    pr10.data.repository.pullRequest.statusCheckRollup.state = 'SUCCESS';
    pr10.data.repository.pullRequest.statusCheckRollup.contexts.nodes[0].conclusion = 'SUCCESS';
    const m = PE.measurePoles(ruleset, pr10, pr5, capture);
    assert.equal(m.coverage, COVERAGE.PARTIAL);
    assert.equal(m.both_poles, false);
    assert.ok(m.missing.some((g) => /PR#10/.test(g)));
  });

  it('claiming OIDC on a gh dump is refused', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-pe-oidc-'));
    copyBundle(tmp);
    const cap = JSON.parse(fs.readFileSync(path.join(tmp, 'capture.json'), 'utf8'));
    cap.oidc_attested = true;
    fs.writeFileSync(path.join(tmp, 'capture.json'), JSON.stringify(cap));
    assert.throws(() => PE.evaluate(tmp), /OIDC|capture provenance|oidc/i);
  });

  it('liveUnavailable is NOT_RUN and does not fall back', () => {
    const live = PE.liveUnavailable('PROVIDER_ENFORCED');
    assert.equal(live.coverage, COVERAGE.NOT_COVERED);
    assert.equal(live.evidence_tier, EVIDENCE_TIER.NOT_RUN);
    assert.match(live.why_empty, /does not fall back/);
  });
});

describe('END_TO_END — collage is not a correlated run', () => {
  it('stays PARTIAL / RECORDED: prove-transcript and GitHub PRs do not share a run_id', () => {
    const e2e = PE.measureEndToEnd();
    assert.equal(e2e.coverage, COVERAGE.PARTIAL);
    assert.equal(e2e.evidence_tier, EVIDENCE_TIER.RECORDED);
    assert.equal(e2e.green, false);
    assert.equal(e2e.correlated, false);
    assert.equal(e2e.point8.state, 'MODELLED');
    assert.notEqual(e2e.prove_run_id, e2e.provider_run_id);
    assert.ok(e2e.gaps.some((g) => /shared run_id/.test(g)));
    assert.ok(e2e.gaps.some((g) => /MODELLED/.test(g)));
    assert.match(e2e.why_empty, /layer-coverage, not end-to-end/);
  });
});
