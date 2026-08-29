'use strict';

/**
 * Attack-matrix RUNNER — COVERED only by five-point execution.
 * The three today's-fix regressions must fail closed. Stated-contract rows
 * with no execute id stay NOT_RUN, named.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const AP = require('../lib/assurance-profiles');
const FIX = require('../fixtures/attack-matrix.v1.json');
const {
  runAttackMatrix, fivePointComplete, FIVE, COVERAGE,
} = require('../lib/attack-matrix-runner');

let report;

before(async () => {
  report = await runAttackMatrix(FIX);
});

describe('the runner executes the three regression vectors and they fail closed', () => {
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
  it('a vector with a real executable check is COVERED (five points checked)', () => {
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

  it('the five-point check runs on at least one full vector', () => {
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
