'use strict';

/**
 * Attack-matrix RUNNER — COVERED only by five-point execution.
 * The three today's-fix regressions must fail closed. Stated-contract rows
 * with no execute id stay NOT_RUN, named.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AP = require('../lib/assurance-profiles');
const FIX = require('../fixtures/attack-matrix.v1.json');
const {
  runAttackMatrix, fivePointComplete, FIVE, COVERAGE,
  resolveCapabilityDemo, CAPABILITY_DEMO, DEMO_SRC,
} = require('../lib/attack-matrix-runner');

const DEMO = resolveCapabilityDemo();
const EXECUTE_IDS = AP.ATTACK_MATRIX.execute_ids;

let report;

before(async () => {
  report = await runAttackMatrix(FIX);
});

describe('the runner executes the three regression vectors and they fail closed', {
  skip: !DEMO.present,
}, () => {
  it('AM-GIT-MISSING-PIN is COVERED and refuses before any ref move', () => {
    const r = report.results.find((x) => x.id === 'AM-GIT-MISSING-PIN');
    assert.ok(r, 'git missing-pin vector must run');
    assert.equal(r.coverage, COVERAGE.COVERED, JSON.stringify(r));
    assert.equal(r.fail_closed, true, '4742476: missing expected_old_sha must refuse');
    assert.equal(r.points.target.changed, false);
    assert.equal(r.points.nonce.consumed, false);
    assert.equal(r.points.executor.reason, 'missing_expected_old_sha');
    assert.equal(r.points.gate.decision, 'REFUSED');
    assert.equal(r.points.attestation.present, false);
  });

  it('AM-HTTP-MISSING-ETAG is COVERED and refuses before PUT (missing and weak)', () => {
    const r = report.results.find((x) => x.id === 'AM-HTTP-MISSING-ETAG');
    assert.ok(r);
    assert.equal(r.coverage, COVERAGE.COVERED, JSON.stringify(r));
    assert.equal(r.fail_closed, true, '0988a20: missing/weak ETag must refuse before PUT');
    assert.equal(r.points.target.changed, false);
    assert.equal(r.points.target.writes, 0);
    assert.equal(r.points.executor.reason, 'missing_strong_etag');
    assert.equal(r.points.gate.decision, 'REFUSED');
    assert.equal(r.weak_etag.reason, 'missing_strong_etag');
  });

  it('AM-RECONCILE-FORGED-ATTEST is COVERED and stays INDETERMINATE', () => {
    const r = report.results.find((x) => x.id === 'AM-RECONCILE-FORGED-ATTEST');
    assert.ok(r);
    assert.equal(r.coverage, COVERAGE.COVERED, JSON.stringify(r));
    assert.equal(r.fail_closed, true, 'eeae7e7: forged attestation must not CONFIRMED');
    assert.equal(r.points.executor.status, 'INDETERMINATE');
    assert.equal(r.points.attestation.valid, false);
    assert.equal(r.points.gate.decision, 'INDETERMINATE');
    assert.equal(r.points.target.changed, false);
  });
});

describe('COVERED is by execution, NOT_RUN stays named', () => {
  it('a vector with a real executable check is COVERED (five points checked)', {
    skip: !DEMO.present,
  }, () => {
    for (const id of AP.ATTACK_MATRIX.execute_ids) {
      const r = report.results.find((x) => x.id === id);
      assert.equal(r.coverage, COVERAGE.COVERED, id);
      assert.equal(fivePointComplete(r), true, id);
      assert.ok(report.covered.includes(id), id);
    }
  });

  it('a vector with no executable check stays NOT_RUN, named — never silently COVERED', () => {
    const replay = report.results.find((x) => x.id === 'AM-REPLAY');
    assert.equal(replay.coverage, COVERAGE.NOT_RUN);
    assert.ok(replay.why_not_run && replay.why_not_run.length > 10);
    assert.equal(fivePointComplete(replay), false);
    assert.equal(report.covered.includes('AM-REPLAY'), false);
    const named = report.not_run.find((n) => n.id === 'AM-REPLAY');
    assert.ok(named, 'NOT_RUN must be named in the report');
    assert.ok(named.why);

    for (const id of ['AM-RAW-TOOL', 'AM-CONCURRENT', 'AM-STALE-STATE',
      'AM-EXPIRED-NONCE', 'AM-PAYLOAD-SWAP', 'AM-MISSING-ATTESTATION']) {
      const r = report.results.find((x) => x.id === id);
      assert.equal(r.coverage, COVERAGE.NOT_RUN, id);
      assert.equal(report.covered.includes(id), false, id);
    }
  });

  it('the five-point check runs on at least one full vector', {
    skip: !DEMO.present,
  }, () => {
    assert.deepEqual(FIVE, ['target', 'nonce', 'executor', 'attestation', 'gate']);
    const full = report.results.find((r) => r.id === 'AM-GIT-MISSING-PIN');
    for (const k of FIVE) {
      assert.equal(full.points[k].checked, true, k);
    }
    assert.equal(fivePointComplete(full), true);
  });

  it('ATOMIC_COMMIT is still NOT_COVERED — this runner does not populate it', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'ATOMIC_COMMIT');
    assert.equal(row.status, AP.STATUS.NOT_COVERED);
    assert.equal(row.green, false);
    assert.equal(AP.ATTACK_MATRIX.populates_profile, null);
  });
});

describe('capability-demo is a declared, commit-pinned dependency', () => {
  // The pin MOVED from 14c82bb to d26d11d when the data-plane subject landed. Not routine
  // freshening: examples/atomic-v2/run.js — the chain that subject executes — was added AT
  // d26d11d and does not exist at 14c82bb, so the subject could never have run against the old
  // pin. Measured side effect of the move, recorded because it is a coverage change and not a
  // no-op: `npm test` went from 116 tests / 2 skipped to 119 / 0. The three attack-matrix
  // regressions were NOT_RUN under the old pin (capability_demo_commit_mismatch against the
  // local sibling) and now execute. The pin is on origin/main.
  it('package.json pins git+commit and names the sibling path', () => {
    const pkg = require('../package.json');
    const pin = pkg.coderifts.capability_demo;
    assert.equal(pin.git, 'https://github.com/coderifts/capability-demo.git');
    assert.equal(pin.commit, 'd26d11d8fc833877798c78f414345f89054be88c');
    assert.equal(pin.sibling, '../capability-demo');
    assert.equal(pin.src, 'demo/src');
    assert.equal(
      pkg.optionalDependencies['capability-demo'],
      `git+https://github.com/coderifts/capability-demo.git#${pin.commit}`,
    );
    assert.equal(CAPABILITY_DEMO.commit, pin.commit);
    assert.equal(DEMO_SRC, path.resolve(__dirname, '..', pin.sibling, pin.src));
  });

  it('README documents the sibling checkout at that commit', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.match(readme, /capability-demo/);
    assert.match(readme, /d26d11d8fc833877798c78f414345f89054be88c/);
    assert.match(readme, /git clone https:\/\/github\.com\/coderifts\/capability-demo\.git/);
    assert.match(readme, /git checkout d26d11d8fc833877798c78f414345f89054be88c/);
    assert.match(readme, /capability_demo_absent/);
    assert.match(readme, /never silently COVERED/);
  });

  it('capability-demo absent → NOT_RUN / capability_demo_absent, never COVERED, never throws', async () => {
    const missing = path.join(os.tmpdir(), `no-cr-demo-${process.pid}`);
    const r = await runAttackMatrix(FIX, { demoSrc: missing });
    assert.equal(r.capability_demo.present, false);
    assert.equal(r.capability_demo.reason, 'capability_demo_absent');
    assert.equal(r.capability_demo.expected_commit, CAPABILITY_DEMO.commit);
    assert.ok(r.capability_demo.expected_path);

    for (const id of EXECUTE_IDS) {
      const row = r.results.find((x) => x.id === id);
      assert.ok(row, id);
      assert.equal(row.coverage, COVERAGE.NOT_RUN, id);
      assert.match(row.why_not_run, /capability_demo_absent/);
      assert.match(row.why_not_run, new RegExp(CAPABILITY_DEMO.commit));
      assert.equal(r.covered.includes(id), false, `${id} must not be COVERED when demo is absent`);
      const named = r.not_run.find((n) => n.id === id);
      assert.ok(named, `${id} must be named in not_run`);
      assert.match(named.why, /capability_demo_absent/);
    }
  });
});
