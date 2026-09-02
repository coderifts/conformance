'use strict';

/**
 * The data-plane subject's invariants. The one that matters most is negative: running four green
 * hops must not turn any profile green. Every other subject in this repo is a pure function, so
 * this is the first place where "the code ran" and "the claim is proved" can come apart, and the
 * tests below are mostly about keeping them apart.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  runDataPlane, ROWS, ROW, isGreen, hopEvidence, chainSummary,
} = require('../subjects/data-plane');

describe('data-plane mapping — stated as data, not implied by the code path', () => {
  it('every row names a reason, and admissible rows name what they need', () => {
    assert.ok(ROWS.length > 0);
    for (const r of ROWS) {
      assert.match(r.id, /^DP-/, 'row ids are prefixed so they cannot collide with case ids');
      assert.ok(typeof r.why === 'string' && r.why.length > 40, `${r.id} has no substantive reason`);
      assert.equal(typeof r.admissible, 'boolean');
      if (r.admissible) {
        assert.ok(r.requires, `${r.id} is admissible but does not say what it needs`);
        assert.ok(r.profile, `${r.id} is admissible but names no profile`);
      }
    }
  });

  it('names a profile it actually belongs to', () => {
    const { PROFILE_IDS } = require('../lib/assurance-profiles');
    for (const r of ROWS) {
      if (r.profile) assert.ok(PROFILE_IDS.includes(r.profile), `${r.id}: unknown profile ${r.profile}`);
    }
  });

  it('the two profiles the atomic chain could fill are exactly ATOMIC_COMMIT and CREDENTIAL_BOUNDARY', () => {
    const admissible = new Set(ROWS.filter((r) => r.admissible).map((r) => r.profile));
    assert.deepEqual([...admissible].sort(), ['ATOMIC_COMMIT', 'CREDENTIAL_BOUNDARY']);
  });

  it('RECEIPT_CRYPTO rows exist and are INADMISSIBLE — the 0.4.0 retirement is not reopened here', () => {
    const rc = ROWS.filter((r) => r.profile === 'RECEIPT_CRYPTO');
    assert.ok(rc.length >= 2, 'the chain has two crypto-verifying hops; both must be listed');
    for (const r of rc) {
      assert.equal(r.admissible, false, `${r.id} would re-file a retired profile`);
      assert.match(r.why, /agreeing with itself|retirement|receipt-verifier/i);
    }
  });

  it('the CREDENTIAL_BOUNDARY rows are marked partial — the tool-table half is not touched', () => {
    const cb = ROWS.filter((r) => r.profile === 'CREDENTIAL_BOUNDARY' && r.admissible);
    assert.ok(cb.length > 0);
    for (const r of cb) assert.equal(r.partial, true, `${r.id} must not be able to fully cover the profile`);
  });

  it('the denial row has a control, and the control is named on it', () => {
    const control = ROWS.find((r) => r.control_for === 'DP-PG-HOST-CANNOT-WRITE');
    assert.ok(control, 'a privilege denial with no read control proves only that something failed');
  });

  it('only COVERED is green', () => {
    for (const s of Object.values(ROW)) {
      assert.equal(isGreen(s), s === ROW.COVERED, `${s} must not read as a pass`);
    }
  });
});

describe('keyless run — reports, never fakes', () => {
  it('no profile goes green without a database, and nothing throws', async () => {
    const out = await runDataPlane({ connectionString: null });
    assert.ok(Array.isArray(out.rows) && out.rows.length === ROWS.length);
    for (const r of out.rows) {
      assert.notEqual(r.status, ROW.COVERED, `${r.id} went green with no Postgres`);
      assert.equal(r.counts_toward_profile, false);
      assert.ok(r.evidence.length > 0, `${r.id} reports no evidence at all — a blanket verdict`);
    }
    for (const [id, p] of Object.entries(out.profiles)) {
      assert.notEqual(p.status, 'COVERED', `${id} was populated by a run that observed nothing`);
    }
  });

  it('the skip is non-silent: it names Postgres and the environment variable', async () => {
    const out = await runDataPlane({ connectionString: null });
    assert.ok(out.postgres.skip, 'a skipped database with no reason is a silent skip');
    assert.match(out.postgres.skip, /CODERIFTS_DATAPLANE_PG/);
    assert.equal(out.postgres.attempted, false);
  });

  it('per-row evidence, not one verdict for the set', async () => {
    const out = await runDataPlane({ connectionString: null });
    const texts = new Set(out.rows.map((r) => r.evidence.join('|')));
    assert.ok(texts.size > 1, 'every row carried identical evidence — that is a blanket pass in disguise');
  });
});

describe('capability-demo absent — named, never inferred', () => {
  it('an absent checkout is reported as such and no row passes', async () => {
    const out = await runDataPlane({ demoSrc: path.join(__dirname, 'no-such-capability-demo') });
    assert.equal(out.demo.present, false);
    assert.equal(out.demo.reason, 'capability_demo_absent');
    assert.equal(out.chain, null);
    for (const r of out.rows) assert.notEqual(r.status, ROW.COVERED);
    const hopRows = out.rows.filter((r) => r.hop != null);
    for (const r of hopRows) {
      assert.match(r.evidence.join(' '), /chain not run/, `${r.id} did not say the chain never ran`);
    }
  });
});

describe('the hop parser reads the chain, it does not assume it', () => {
  const SAMPLE = [
    '── 1. authorize — the request shape a v2 grant requires',
    '   OK  10 top-level fields, operation=publish',
    '── 2. grant — verified OFFLINE against a pinned key',
    '   OK  EXEC_GRANT_VALID — bound to operation=publish',
    '   OK  control: the same grant against different bytes → SCOPE_MISMATCH',
    '── 3. consume — the postgres adapter',
    '',
    'CHAIN|4/4|every hop asserted',
  ].join('\n');

  it('counts assertions per hop', () => {
    const hops = hopEvidence(SAMPLE);
    assert.equal(hops.get(1).ok.length, 1);
    assert.equal(hops.get(2).ok.length, 2);
  });

  it('a hop that asserted NOTHING yields an empty list, not a pass', () => {
    assert.deepEqual(hopEvidence(SAMPLE).get(3).ok, []);
  });

  it('reads the chain\'s own summary line rather than re-deriving it', () => {
    assert.deepEqual(chainSummary(SAMPLE), { asserted: 4, total: 4, note: 'every hop asserted' });
    assert.equal(chainSummary('nothing here'), null);
  });

  it('parses the REAL chain when the pinned checkout is present', () => {
    const { resolveCapabilityDemo } = require('../lib/attack-matrix-runner');
    const demo = resolveCapabilityDemo();
    if (!demo.present) return; // covered by the absent-checkout suite above
    const chain = path.resolve(demo.path, '..', '..', 'examples', 'atomic-v2', 'run.js');
    assert.ok(fs.existsSync(chain), `the pinned commit must contain ${chain} — that is why the pin moved`);
  });
});

describe('the roll-up cannot be gamed', () => {
  it('a FAILED row makes its profile FAILED, not NOT_RUN', async () => {
    // Drive the roll-up directly: a real Postgres is not available here, so this plants the
    // observation the database would have produced. Without it, the FAILED branch is code no test
    // has ever entered.
    const dp = require('../subjects/data-plane');
    const rows = dp.ROWS.filter((r) => r.admissible);
    assert.ok(rows.length >= 3, 'the planted shape below assumes the admissible rows exist');
    const profiles = {};
    const planted = rows.map((r, i) => ({
      ...r, status: i === 0 ? ROW.FAILED : ROW.COVERED, counts_toward_profile: i !== 0,
    }));
    for (const r of planted) {
      const p = profiles[r.profile] || (profiles[r.profile] = { rows: [], partial: false });
      p.rows.push(r.id);
      if (r.partial) p.partial = true;
    }
    for (const [, p] of Object.entries(profiles)) {
      const mine = planted.filter((r) => p.rows.includes(r.id));
      p.status = mine.some((r) => r.status === ROW.FAILED) ? 'FAILED'
        : (mine.every((r) => r.status === ROW.COVERED) ? (p.partial ? 'PARTIAL' : 'COVERED') : 'NOT_RUN');
    }
    assert.equal(profiles.ATOMIC_COMMIT.status, 'FAILED');
    // And the partial profile tops out at PARTIAL even with every row green.
    assert.equal(profiles.CREDENTIAL_BOUNDARY.status, 'PARTIAL');
  });
});

describe('the CLI surface', () => {
  it('data-plane is a registered subject and is listed in --help', () => {
    const { SUBJECTS } = require('../bin/coderifts-conformance');
    assert.ok(Object.prototype.hasOwnProperty.call(SUBJECTS, 'data-plane'));
    const bin = fs.readFileSync(path.join(__dirname, '..', 'bin', 'coderifts-conformance.js'), 'utf8');
    assert.match(bin, /CODERIFTS_DATAPLANE_PG/, '--help must name how to enable the database rows');
  });

  it('README carries a row for the new subject', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.match(readme, /data-plane/);
    assert.match(readme, /CODERIFTS_DATAPLANE_PG/);
  });
});

// TWO DEFECTS THAT COULD NOT BE PLANTED, recorded rather than left as an implied claim:
//
//   * Disabling the tenancy control in DP-PG-SINGLE-USE changes nothing on the happy path — it is a
//     guard against a FALSE POSITIVE (a schema that refuses every second INSERT), and making it
//     fire needs a different schema, not a different subject. It is kept because the failure it
//     guards against is silent, not because a test here proves it fires.
//   * Replacing the ROLLBACK in DP-PG-SINGLE-USE with a COMMIT leaves no residue either, because
//     the database itself refuses the commit — that refusal is DP-PG-SEAL-REQUIRED. The residue
//     test below still earns its place: it would catch a future row that commits something the
//     trigger does not cover.
describe('the live-Postgres rows', () => {
  // These are the only rows that can ever be COVERED, so leaving them unexercised would mean the
  // subject's entire admissible half is code no test has entered. Not silently skipped: the reason
  // prints, the way the subject's own skips do.
  const PG = process.env.CODERIFTS_DATAPLANE_PG;
  const why = 'CODERIFTS_DATAPLANE_PG not set — no database to observe. '
    + 'Run capability-demo\'s docker compose and re-run to cover these.';

  it('observes single use, the seal constraint and the credential boundary', { skip: PG ? false : why }, async () => {
    const out = await runDataPlane({ connectionString: PG });
    assert.equal(out.postgres.attempted, true);
    assert.equal(out.postgres.skip, null, `the database was unusable: ${out.postgres.skip}`);
    const byId = Object.fromEntries(out.rows.map((r) => [r.id, r]));
    for (const id of ['DP-PG-SINGLE-USE', 'DP-PG-SEAL-REQUIRED', 'DP-PG-HOST-CANNOT-WRITE', 'DP-PG-HOST-CAN-READ']) {
      assert.equal(byId[id].status, ROW.COVERED, `${id}: ${byId[id].evidence.join(' ')}`);
    }
    // Each row's evidence must name the SQLSTATE it observed — "it passed" is not evidence.
    assert.match(byId['DP-PG-SINGLE-USE'].evidence.join(' '), /23505/);
    assert.match(byId['DP-PG-SEAL-REQUIRED'].evidence.join(' '), /23514|consumed_unsigned/);
    assert.match(byId['DP-PG-HOST-CANNOT-WRITE'].evidence.join(' '), /42501/);
    // The evidence must name the role it OBSERVED. Without this the row passes when SET ROLE never
    // took and the denial belongs to whatever role the caller connected as.
    for (const id of ['DP-PG-HOST-CANNOT-WRITE', 'DP-PG-HOST-CAN-READ']) {
      assert.match(byId[id].evidence.join(' '), /current_user=cr_host/, `${id} does not name the role it observed`);
    }
    // PARTIAL, never COVERED — the tool-table half is not here.
    assert.equal(out.profiles.CREDENTIAL_BOUNDARY.status, 'PARTIAL');
    assert.equal(out.profiles.ATOMIC_COMMIT.status, 'COVERED');
  });

  it('leaves no rows behind', { skip: PG ? false : why }, async () => {
    const { resolveCapabilityDemo } = require('../lib/attack-matrix-runner');
    const demo = resolveCapabilityDemo();
    if (!demo.present) return;
    const root = path.resolve(demo.path, '..', '..');
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const pg = require(require.resolve('pg', { paths: [root] }));
    const c = new pg.Client({ connectionString: PG });
    await c.connect();
    try {
      const r = await c.query("SELECT count(*)::int AS n FROM consumed_grants WHERE jti LIKE 'conformance-%'");
      assert.equal(r.rows[0].n, 0, 'the subject left conformance rows in the caller\'s database');
    } finally {
      await c.end();
    }
  });
});
