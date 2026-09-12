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

function pgResolvableFromDemo() {
  if (!DEMO.present || !DEMO.path) return false;
  const root = path.resolve(DEMO.path, '..', '..');
  try {
    require.resolve('pg', { paths: [root] });
    return true;
  } catch (_) {
    return false;
  }
}
const PG = pgResolvableFromDemo();

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

  it('AM-RECONCILE-FORGED-ATTEST is COVERED and stays INDETERMINATE', {
    skip: !PG,
  }, () => {
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
    const needPg = new Set(['AM-RECONCILE-FORGED-ATTEST']);
    for (const id of AP.ATTACK_MATRIX.execute_ids) {
      if (needPg.has(id) && !PG) continue;
      const r = report.results.find((x) => x.id === id);
      assert.equal(r.coverage, COVERAGE.COVERED, id);
      assert.equal(fivePointComplete(r), true, id);
      assert.ok(report.covered.includes(id), id);
    }
  });

  // ── TWO REASONS A VECTOR DOES NOT RUN, EACH ASSERTED ON ITS OWN BRANCH ───────────────
  //
  // This was one test asserting /pg/i. MEASURED after the capability-demo npm dependency was
  // dropped and the lockfile regenerated: resolution falls to the sibling checkout, and where
  // there is none — every CI runner — the reason is `capability_demo_absent`, not a pg reason.
  // The test failed on an input that was behaving correctly.
  //
  // The fix is NOT a looser pattern. A vector can fail to run for two different reasons, and a
  // single regex covering both would accept either answer in either context — which is how a
  // check stops being able to tell them apart. Each context gets its own branch, and each branch
  // says what a correct reason looks like THERE. The shared invariant — never a silent COVERED —
  // is asserted on both.

  const notRunRow = () => {
    const r = report.results.find((x) => x.id === 'AM-RECONCILE-FORGED-ATTEST');
    assert.ok(r, 'AM-RECONCILE-FORGED-ATTEST is missing from the report');
    assert.equal(r.coverage, COVERAGE.NOT_RUN);
    assert.equal(report.covered.includes('AM-RECONCILE-FORGED-ATTEST'), false,
      'a vector that did not run must never appear in covered[]');
    // A reason that is absent, empty or a shrug is the failure this whole describe block exists
    // to prevent — on either branch.
    assert.ok(r.why_not_run && r.why_not_run.trim().length > 10,
      `NOT_RUN without a named reason: ${JSON.stringify(r.why_not_run)}`);
    return r;
  };

  it('(a) chain resolved, pg absent: NOT_RUN names pg — never silent COVERED', {
    skip: PG || !DEMO.present,
  }, () => {
    // The original assertion, unchanged in strictness: when the chain COULD run and only the
    // database is missing, the reason must say so.
    assert.match(notRunRow().why_not_run, /pg/i);
  });

  it('(b) chain not resolved: NOT_RUN names the capability-demo state and the pinned commit', {
    skip: DEMO.present,
  }, () => {
    const why = notRunRow().why_not_run;
    // An ALLOW-LIST of the resolver's two named states, not a pattern. A third state invented
    // later fails here rather than passing because it happens to contain a matching substring.
    const state = String(why).split(':')[0].trim();
    assert.ok(
      ['capability_demo_absent', 'capability_demo_commit_mismatch'].includes(state),
      `unnamed capability-demo state: ${JSON.stringify(state)}`,
    );
    // And it must name WHICH checkout was expected. "absent" alone does not tell a reader
    // whether they are missing a checkout or holding the wrong one.
    assert.match(why, new RegExp(CAPABILITY_DEMO.commit));
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

  it('this runner still does not populate ATOMIC_COMMIT — COVERED is the recorded transcript, not the matrix', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'ATOMIC_COMMIT');
    assert.equal(row.coverage, AP.COVERAGE.COVERED);
    assert.equal(row.evidence_tier, AP.EVIDENCE_TIER.RECORDED);
    assert.equal(AP.ATTACK_MATRIX.populates_profile, null);
    assert.equal(AP.VECTOR_MAP.some((v) => v.profile === 'ATOMIC_COMMIT'), false);
  });

  it('a node_modules install is not a commit mismatch against THIS repo HEAD', () => {
    // npm git-deps have no .git; walking up used to observe the conformance HEAD and
    // refuse the pin (capability_demo_commit_mismatch). The lockfile is the pin.
    const demo = resolveCapabilityDemo();
    if (demo.path && String(demo.path).includes(`${path.sep}node_modules${path.sep}`)) {
      assert.notEqual(demo.reason, 'capability_demo_commit_mismatch', JSON.stringify(demo));
      assert.equal(demo.present, true, JSON.stringify(demo));
    }
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
    // The pin is a LITERAL on purpose. Deriving it from the sibling's current HEAD would make
    // this assertion agree with whatever is checked out, which is the one thing a pin must not
    // do. Moving it is therefore a deliberate edit that shows up in review — as here: the pin
    // moved to the commit that carries @coderifts/prove 0.1.12, because that is the prove this
    // release is measured against. The previous value (188479a…) predates it, and after the
    // lockfile regeneration removed the npm copy, resolution fell to a sibling the old pin no
    // longer named.
    assert.equal(pin.commit, '75a09d8b74f1161d40415fb98c2537f116d9ffdc');
    assert.equal(pin.sibling, '../capability-demo');
    assert.equal(pin.src, 'demo/src');
    // 1626 — THE GIT optionalDependency IS GONE, AND THAT IS THE ASSERTION NOW.
    //
    // This line used to require it. MEASURED before removing it: with the dependency installed
    // the chain really did run (DP-1 read `13 top-level fields, operation=publish`, not a
    // skip), and the row distribution was still 4 NOT_ADMISSIBLE + 4 SKIPPED — byte for byte
    // what it is without it. The suite declares every one of those rows inadmissible on its own
    // doctrine ("one repository agreeing with itself"), so the dependency bought a real
    // observation that cannot count, at the cost of every consumer install reaching github.com,
    // a stale @coderifts/prove@0.1.1 shadowing the published 0.1.11 bin, and a raw commit SHA
    // sitting outside the frozen-release-set machinery.
    //
    // The DESCRIPTOR below stays: lib/attack-matrix-runner.js reads it to resolve the sibling
    // checkout and to name the commit in `capability_demo_absent`. A developer with the sibling
    // still runs the chain; a consumer gets a named absence. Only the npm-install-time git fetch
    // is gone.
    assert.ok(
      !pkg.optionalDependencies || !pkg.optionalDependencies['capability-demo'],
      'capability-demo must not be an npm dependency — it is resolved from the sibling checkout',
    );
    assert.equal(CAPABILITY_DEMO.commit, pin.commit);
    assert.equal(DEMO_SRC, path.resolve(__dirname, '..', pin.sibling, pin.src));
  });

  // THE README AND THE PIN MOVE TOGETHER, AND THIS TEST IS WHAT MAKES THAT TRUE.
  //
  // MEASURED when the pin moved: this test kept passing, because the README and the literals
  // below both still named the old commit — while package.json named the new one. A reader
  // following the README would have checked out a commit the resolver then reported as
  // capability_demo_commit_mismatch. A green test beside a wrong instruction is the shape worth
  // naming: it was not asserting agreement with the pin, only agreement with itself.
  it('README documents the sibling checkout at that commit', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.match(readme, /capability-demo/);
    assert.match(readme, /75a09d8b74f1161d40415fb98c2537f116d9ffdc/);
    assert.match(readme, /git clone https:\/\/github\.com\/coderifts\/capability-demo\.git/);
    assert.match(readme, /git checkout 75a09d8b74f1161d40415fb98c2537f116d9ffdc/);
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
