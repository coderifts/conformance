/**
 * DATA-PLANE subject — runs the capability-demo atomic chain instead of a decision function.
 *
 * WHY IT IS NOT LIKE THE OTHERS. Every other subject in this directory is a pure function of case
 * input: `(case) => outcome`, scored against cases.v1.json. This one executes
 * `examples/atomic-v2/run.js` — four real hops against real code — and reports what each hop is
 * evidence FOR. That difference is the point: a pure subject can never populate CREDENTIAL_BOUNDARY
 * or ATOMIC_COMMIT, because both are properties of a running system, and assurance-profiles.js
 * says so in as many words ("any vector would score a FAKE host").
 *
 * THE RESULT OF MEASURING, STATED UP FRONT, BECAUSE IT IS NOT THE EXPECTED ONE:
 * running the chain with NO POSTGRES fills ZERO profiles. Not one. The four hops all pass, and
 * none of them is admissible:
 *
 *   hop 1  the v2 request shape          — a request shape is not one of the seven claims
 *   hop 2  grant verified offline        — capability-demo MINTS the grant and capability-demo
 *                                          VERIFIES it. RECEIPT_CRYPTO was retired from this suite
 *                                          in 0.4.0 for exactly this: "a generator and a verifier
 *                                          in one repository agreeing with itself, which measures
 *                                          nothing." The rule applies to this subject too.
 *   hop 3  consumeOnce                   — called with no `query`, demo/src/atomic.js:261 performs
 *                                          NO replay lookup and returns consumed:true. Its own
 *                                          detail string says it "reports the jti is unclaimed, it
 *                                          does not claim it". A passing hop, zero evidence.
 *   hop 4  attestation verified          — RECEIPT_CRYPTO again, and it runs for real in
 *                                          receipt-verifier across two independent implementations.
 *
 * A subject that turned four green hops into two green profiles would be the inflation this repo's
 * profile split exists to prevent. So the keyless run reports rows, evidence and skips — and no
 * profile goes green on it.
 *
 * WITH A LIVE POSTGRES two rows become real, and they are the two the brief named:
 *   ATOMIC_COMMIT        — the same jti INSERTed twice into consumed_grants; the second must raise
 *                          23505. That is the single-use claim, made by the primary key inside the
 *                          consuming transaction (demo/sql/gate.sql, cr_execute_grant).
 *   CREDENTIAL_BOUNDARY  — cr_host attempting UPDATE on articles must raise 42501. Measured against
 *                          demo/sql/roles.sql, which REVOKEs ALL on articles from cr_host and grants
 *                          back SELECT only. PARTIAL: this is the database half. The tool-table half
 *                          (a raw tool beside the guarded table) is not touched here and stays with
 *                          @coderifts/bypass-probe.
 *
 * No API key on any path. No network. Postgres is opt-in via CODERIFTS_DATAPLANE_PG.
 *
 * WHY THIS DOES NOT FEED buildProfileReport() / --assurance. Deliberate. Those drive CI gates, and
 * a gate whose colour depends on whether a database happened to be reachable is worse than one that
 * is honestly red: it goes green on a developer's laptop and red in CI for reasons unrelated to the
 * code. The seven-profile report keeps saying NOT COVERED, which stays true of THE SUITE. This
 * subject reports separately what a run with a database observed, and a reader who wants the
 * stronger claim runs it and reads the rows.
 *
 * @module @coderifts/conformance/subjects/data-plane
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { resolveCapabilityDemo } = require('../lib/attack-matrix-runner');

/** Row status. COVERED is the only one that may render as a pass. */
const ROW = Object.freeze({
  COVERED: 'COVERED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  NOT_ADMISSIBLE: 'NOT_ADMISSIBLE',
});

/** Never let anything but COVERED read as green. */
function isGreen(status) {
  return status === ROW.COVERED;
}

/**
 * The mapping, as DATA. Every row names the profile it could populate and the reason it does or
 * does not. `admissible:false` rows can never go green however well the hop runs — that is what
 * separates "the code worked" from "the claim is proved".
 */
const ROWS = Object.freeze([
  {
    id: 'DP-1-REQUEST-SHAPE',
    hop: 1,
    profile: null,
    admissible: false,
    why:
      'A request shape is not one of the seven assurance claims. It is a type, and it is pinned as '
      + 'one in the SDKs (EXECUTION_GRANT_V2_REQUEST_FIELDS) against the app\'s canonical fixture. '
      + 'Filing it under DECISION_LOGIC would count a schema as a verdict invariant.',
  },
  {
    id: 'DP-2-GRANT-OFFLINE-VERIFY',
    hop: 2,
    profile: 'RECEIPT_CRYPTO',
    admissible: false,
    why:
      'capability-demo mints this grant (demo/issue-grant.js) and capability-demo verifies it '
      + '(packages/middleware/src/verify-grant.js). RECEIPT_CRYPTO left this suite in 0.4.0 with '
      + 'that exact reason recorded — one repository agreeing with itself. The hop is a good '
      + 'integration check and it is not evidence here. It runs for real in the app against the '
      + 'real verify functions, and in receipt-verifier across a JS and a Python implementation.',
  },
  {
    id: 'DP-3-CONSUME-ONCE-KEYLESS',
    hop: 3,
    profile: 'ATOMIC_COMMIT',
    admissible: false,
    why:
      'consumeOnce called without a `query` function (demo/src/atomic.js:257-277) runs no lookup at '
      + 'all and returns consumed:true, strength ATOMIC_TRANSACTION. The strength is a DECLARATION '
      + 'about the postgres path, not an observation of it — the function\'s own detail string says '
      + 'it reports the jti unclaimed and does not claim it. A green hop with nothing behind it is '
      + 'precisely what ATOMIC_COMMIT\'s why_empty warns about (the EG-A-STATE-NONCE-MISMATCH trap).',
  },
  {
    id: 'DP-4-ATTESTATION-VERIFY',
    hop: 4,
    profile: 'RECEIPT_CRYPTO',
    admissible: false,
    why:
      'Same retirement as DP-2. The forged-signature control in the hop is real and worth running; '
      + 'the verifier it runs against is receipt-verifier\'s published one, where the vectors live.',
  },
  {
    id: 'DP-PG-SINGLE-USE',
    hop: null,
    profile: 'ATOMIC_COMMIT',
    admissible: true,
    requires: 'postgres',
    why:
      'The same jti INSERTed twice into consumed_grants; the second must raise 23505. This is the '
      + 'single-use claim as the schema actually makes it — a PRIMARY KEY inside the consuming '
      + 'transaction — rather than a function reporting its own strength.',
    ceiling:
      'Proves a replayed jti cannot be claimed twice. Does NOT prove the mutation and the claim '
      + 'share one transaction end to end; that is cr_execute_grant + the deferred constraint '
      + 'trigger, and driving it needs a state challenge and an article row.',
  },
  {
    id: 'DP-PG-SEAL-REQUIRED',
    hop: null,
    profile: 'ATOMIC_COMMIT',
    admissible: true,
    requires: 'postgres',
    why:
      'A row INSERTed into consumed_grants and then COMMITted with no sealed attestation must raise '
      + '23514 `consumed_unsigned`. This row was NOT designed — it was found: the first version of '
      + 'DP-PG-SINGLE-USE tried a plain INSERT + COMMIT and the deferred constraint trigger refused '
      + 'it. That refusal is the closest thing this suite can observe to ATOMIC_COMMIT\'s actual '
      + 'sentence, "a claim and the mutation it authorises either both happen or neither does": a '
      + 'consume that is not sealed cannot reach commit at all.',
    ceiling:
      'Observes the COMMIT-time constraint. Does not observe the mutation, because nothing here '
      + 'mutates articles — cr_execute_grant does that, and driving it needs a state challenge.',
  },
  {
    id: 'DP-PG-HOST-CANNOT-WRITE',
    hop: null,
    profile: 'CREDENTIAL_BOUNDARY',
    admissible: true,
    partial: true,
    requires: 'postgres',
    why:
      'cr_host attempting UPDATE on articles must raise 42501. demo/sql/roles.sql REVOKEs ALL on '
      + 'articles from cr_host and grants back SELECT only, and calls that denial "the STEP 1 proof".',
    ceiling:
      'The DATABASE half only. CREDENTIAL_BOUNDARY as written is about a running host\'s tool '
      + 'table — a raw tool beside the guarded one. Nothing here looks at a tool table, so this row '
      + 'makes the profile PARTIAL and never COVERED. That half stays with @coderifts/bypass-probe.',
  },
  {
    id: 'DP-PG-HOST-CAN-READ',
    hop: null,
    profile: 'CREDENTIAL_BOUNDARY',
    admissible: true,
    partial: true,
    requires: 'postgres',
    control_for: 'DP-PG-HOST-CANNOT-WRITE',
    why:
      'The control. cr_host SELECT on articles must SUCCEED. Without it the row above passes just as '
      + 'well when the connection is broken, the role does not exist, or the table is missing — '
      + '"the write failed" is not "the write was refused for lack of privilege".',
  },
]);

const CHAIN_REL = path.join('examples', 'atomic-v2', 'run.js');

/** capability-demo repo root from the resolved `demo/src` path. */
function demoRootOf(demo) {
  return demo && demo.path ? path.resolve(demo.path, '..', '..') : null;
}

function runChain(root, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      process.execPath, [path.join(root, CHAIN_REL)],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs },
      (err, stdout, stderr) => resolve({ code: err ? (err.code == null ? 1 : err.code) : 0, stdout: stdout || '', stderr: stderr || '' }),
    );
  });
}

/**
 * Per-hop evidence from the chain's own output. The chain prints one `── N. what` header per hop
 * and an `   OK  …` line per assertion it actually made, so an unasserted hop yields an empty
 * evidence list rather than an assumed pass.
 */
function hopEvidence(stdout) {
  const hops = new Map();
  let current = null;
  for (const line of String(stdout).split('\n')) {
    const head = /^──\s*(\d+)\.\s*(.*)$/.exec(line);
    if (head) {
      current = Number(head[1]);
      hops.set(current, { hop: current, what: head[2].trim(), ok: [], skipped: false });
      continue;
    }
    if (current == null) continue;
    const okLine = /^\s{2,}OK\s{2}(.*)$/.exec(line);
    if (okLine) hops.get(current).ok.push(okLine[1].trim());
    if (/^\s{2,}SKIPPED\b/.test(line)) hops.get(current).skipped = true;
  }
  return hops;
}

/** `CHAIN|4/4|…` — the chain's own summary line, not a re-derivation of it. */
function chainSummary(stdout) {
  const m = /^CHAIN\|(\d+)\/(\d+)\|(.*)$/m.exec(String(stdout));
  return m ? { asserted: Number(m[1]), total: Number(m[2]), note: m[3] } : null;
}

// ── the live-postgres rows ──────────────────────────────────────────────────────────────────
//
// `pg` is NOT a dependency of this package and must not become one: the npx path stays keyless and
// dependency-light. It is required from the capability-demo checkout, which already has it, and its
// absence is a named skip like any other.

function loadPg(root) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(require.resolve('pg', { paths: [root] }));
  } catch (_) {
    return null;
  }
}

async function pgRows(root, connectionString) {
  const pg = loadPg(root);
  if (!pg) {
    return { skip: `pg module not resolvable from ${root} (run \`npm install\` there)` };
  }
  const rows = {};
  const admin = new pg.Client({ connectionString });
  try {
    await admin.connect();
  } catch (e) {
    return { skip: `could not connect: ${e.message}` };
  }
  try {
    // DP-PG-SINGLE-USE — the primary key is the claim.
    //
    // The key is (deployment_id, jti), not jti alone (demo/src/db.js:52-62), so the replay reuses
    // BOTH. Two things make this harder than one INSERT twice, and both were found by running it:
    //
    //   * A deferred constraint trigger REFUSES COMMIT for an unsealed consumed row (23514). So
    //     this runs inside a transaction that is always ROLLED BACK — the primary key is checked
    //     immediately, the trigger only at commit, and rolling back also leaves no residue in a
    //     database the caller pointed us at.
    //   * A failed statement aborts the whole transaction, so each attempt sits on its own
    //     SAVEPOINT; otherwise the tenancy control below would fail with 25P02 and read like a
    //     tenancy violation.
    //
    // The tenancy control reuses the jti under a DIFFERENT deployment_id and must SUCCEED. Without
    // it, a schema that rejected every second INSERT for any reason would read exactly like
    // single-use enforcement.
    const jti = `conformance-${process.pid}-${Math.floor(process.uptime() * 1e6)}`;
    const dep = 'conformance-dataplane';
    const otherDep = `${dep}-other`;
    const INS = 'INSERT INTO consumed_grants (deployment_id, jti, scope_hash) VALUES ($1, $2, $3)';
    const scope = `sha256:${'0'.repeat(64)}`;
    let second = null;
    let tenancy = null;
    let setupErr = null;
    await admin.query('BEGIN');
    try {
      await admin.query(INS, [dep, jti, scope]);
      await admin.query('SAVEPOINT replay');
      try {
        await admin.query(INS, [dep, jti, scope]);
      } catch (e) {
        second = e.code;
        await admin.query('ROLLBACK TO SAVEPOINT replay');
      }
      await admin.query('SAVEPOINT tenancy');
      try {
        await admin.query(INS, [otherDep, jti, scope]);
        tenancy = 'inserted';
      } catch (e) {
        tenancy = e.code;
        await admin.query('ROLLBACK TO SAVEPOINT tenancy');
      }
    } catch (e) {
      setupErr = `${e.code || ''} ${e.message}`.trim();
    } finally {
      // ALWAYS rolled back: the unsealed rows must never reach commit, and a caller's database is
      // not ours to leave rows in.
      try { await admin.query('ROLLBACK'); } catch (_) { /* already aborted */ }
    }
    if (setupErr) {
      rows['DP-PG-SINGLE-USE'] = { ok: false, evidence: `setup failed: ${setupErr}` };
    } else if (second !== '23505') {
      rows['DP-PG-SINGLE-USE'] = {
        ok: false,
        evidence: second === null
          ? 'second INSERT of the SAME (deployment_id, jti) SUCCEEDED — single use is not enforced by the schema'
          : `second INSERT raised ${second}, expected 23505`,
      };
    } else if (tenancy !== 'inserted') {
      rows['DP-PG-SINGLE-USE'] = {
        ok: false,
        evidence: 'the replay raised 23505 but the SAME jti under a different deployment_id also '
          + `failed (${tenancy}) — the refusal is not the primary key doing its job`,
      };
    } else {
      rows['DP-PG-SINGLE-USE'] = {
        ok: true,
        evidence: `second INSERT of (${dep}, ${jti}) → SQLSTATE 23505; control: the same jti under `
          + `deployment_id=${otherDep} inserted, so the refusal came from the key`,
      };
    }

    // DP-PG-SEAL-REQUIRED — the deferred trigger, observed at COMMIT.
    const sealJti = `${jti}-seal`;
    let commitCode = null;
    let commitMsg = '';
    await admin.query('BEGIN');
    try {
      await admin.query(INS, [dep, sealJti, scope]);
      await admin.query('COMMIT');
    } catch (e) {
      commitCode = e.code;
      commitMsg = e.message || '';
    } finally {
      try { await admin.query('ROLLBACK'); } catch (_) { /* committed or already rolled back */ }
    }
    if (commitCode === '23514' && /consumed_unsigned/.test(commitMsg)) {
      rows['DP-PG-SEAL-REQUIRED'] = {
        ok: true,
        evidence: `COMMIT of an unsealed consumed grant → SQLSTATE 23514 consumed_unsigned`,
      };
    } else if (commitCode === null) {
      // It committed. Clean up, then report the failure honestly.
      try { await admin.query('DELETE FROM consumed_grants WHERE jti = $1', [sealJti]); } catch (_) { /* */ }
      rows['DP-PG-SEAL-REQUIRED'] = {
        ok: false,
        evidence: 'an unsealed consumed grant COMMITted — the deferred constraint did not fire',
      };
    } else {
      rows['DP-PG-SEAL-REQUIRED'] = {
        ok: false,
        evidence: `COMMIT raised ${commitCode} (${commitMsg.split('\n')[0]}), expected 23514 consumed_unsigned`,
      };
    }
  } catch (e) {
    rows['DP-PG-SINGLE-USE'] = { ok: false, evidence: `setup failed: ${e.code || ''} ${e.message}` };
  }

  // The credential rows need the cr_host ROLE, not the admin connection. SET ROLE is enough and
  // avoids putting a second password in this file.
  try {
    // SET ROLE, then CONFIRM it took. Measured the hard way: with the SET ROLE removed the row
    // still went green, because the bootstrap `demo` role is not a superuser here and is denied
    // too — the evidence said "cr_host" while the connection was somebody else. A denial is only
    // evidence about a role if the role is established, so the observed role goes in the evidence
    // and a mismatch fails the row.
    await admin.query('SET ROLE cr_host');
    const who = (await admin.query('SELECT current_user AS u')).rows[0].u;
    if (who !== 'cr_host') {
      const why = `SET ROLE did not take — current_user is ${who}; a denial observed as ${who} says `
        + 'nothing about the host role';
      rows['DP-PG-HOST-CAN-READ'] = { ok: false, evidence: why };
      rows['DP-PG-HOST-CANNOT-WRITE'] = { ok: false, evidence: why };
      throw Object.assign(new Error('role_not_established'), { handled: true });
    }
    let readOk = null;
    let writeCode = null;
    try {
      await admin.query('SELECT id FROM articles LIMIT 1');
      readOk = true;
    } catch (e) {
      readOk = false;
      writeCode = `read failed first: ${e.code}`;
    }
    if (readOk) {
      try {
        await admin.query("UPDATE articles SET title = title WHERE false");
        writeCode = null;
      } catch (e) {
        writeCode = e.code;
      }
    }
    rows['DP-PG-HOST-CAN-READ'] = readOk
      ? { ok: true, evidence: `SELECT on articles as current_user=${who} succeeded — the role and table are reachable` }
      : { ok: false, evidence: `cr_host could not SELECT articles (${writeCode}) — the denial below would prove nothing` };
    rows['DP-PG-HOST-CANNOT-WRITE'] = !readOk
      ? { ok: false, evidence: 'not attempted: the read control failed, so a failing write is uninformative' }
      : (writeCode === '42501'
        ? { ok: true, evidence: `UPDATE on articles as current_user=${who} → SQLSTATE 42501 (insufficient_privilege)` }
        : {
          ok: false,
          evidence: writeCode === null
            ? 'cr_host UPDATE on articles SUCCEEDED — the host role can write to the protected table'
            : `cr_host UPDATE raised ${writeCode}, expected 42501`,
        });
  } catch (e) {
    if (!e.handled) {
      const why = `SET ROLE cr_host failed (${e.code || ''} ${e.message}) — run capability-demo's migrate first`;
      rows['DP-PG-HOST-CAN-READ'] = { ok: false, evidence: why };
      rows['DP-PG-HOST-CANNOT-WRITE'] = { ok: false, evidence: why };
    }
  } finally {
    try { await admin.query('RESET ROLE'); } catch (_) { /* best effort */ }
    try { await admin.end(); } catch (_) { /* best effort */ }
  }
  return { rows };
}

/**
 * Run the data-plane subject.
 *
 * @param {{ demoSrc?: string, connectionString?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ rows: object[], chain: object|null, demo: object, profiles: object }>}
 */
async function runDataPlane(opts = {}) {
  const demo = resolveCapabilityDemo(opts);
  const root = demoRootOf(demo);
  const chainPath = root ? path.join(root, CHAIN_REL) : null;
  // An EXPLICIT connectionString wins, including an explicit null. `opts.x || process.env.y` cannot
  // express "no database, deliberately" — it silently reads the ambient one, which is how a test of
  // the keyless path ends up running against whatever database the developer had open.
  const connectionString = Object.prototype.hasOwnProperty.call(opts, 'connectionString')
    ? (opts.connectionString || null)
    : (process.env.CODERIFTS_DATAPLANE_PG || null);

  let chain = null;
  let hops = new Map();
  let chainSkip = null;
  if (!demo.present) {
    chainSkip = `${demo.reason}: expected ${demo.path || demo.expected_path} at commit ${demo.expected_commit}`
      + `${demo.observed_commit ? ` observed=${demo.observed_commit}` : ''}`;
  } else if (!fs.existsSync(chainPath)) {
    chainSkip = `the atomic chain is not at ${chainPath} in the pinned checkout`;
  } else {
    const run = await runChain(root, opts.timeoutMs || 60000);
    hops = hopEvidence(run.stdout);
    chain = { exit: run.code, summary: chainSummary(run.stdout), stderr: run.stderr.trim() || null };
    if (run.code !== 0) chainSkip = `the chain exited ${run.code}: ${run.stderr.trim().split('\n').pop() || 'no stderr'}`;
  }

  let pg = null;
  let pgSkip = null;
  if (!connectionString) {
    pgSkip = 'no CODERIFTS_DATAPLANE_PG — the keyless path does not start a database, and a row '
      + 'that cannot observe one is skipped rather than assumed';
  } else if (!root) {
    pgSkip = 'capability-demo absent, so its `pg` module cannot be borrowed';
  } else {
    const out = await pgRows(root, connectionString);
    if (out.skip) pgSkip = out.skip;
    else pg = out.rows;
  }

  const rows = ROWS.map((spec) => {
    // Inadmissible rows: the mapping decision, independent of how the hop ran.
    if (!spec.admissible) {
      const h = spec.hop != null ? hops.get(spec.hop) : null;
      return {
        ...spec,
        status: ROW.NOT_ADMISSIBLE,
        evidence: h
          ? (h.ok.length ? h.ok : ['the hop ran and asserted nothing'])
          : (chainSkip ? [`chain not run — ${chainSkip}`] : ['the hop did not run']),
        counts_toward_profile: false,
      };
    }
    const observed = pg && pg[spec.id];
    if (!observed) {
      return {
        ...spec,
        status: ROW.SKIPPED,
        evidence: [pgSkip || 'not attempted'],
        counts_toward_profile: false,
      };
    }
    return {
      ...spec,
      status: observed.ok ? ROW.COVERED : ROW.FAILED,
      evidence: [observed.evidence],
      counts_toward_profile: observed.ok,
    };
  });

  // Profile roll-up. A profile goes green only when EVERY admissible row naming it is COVERED and
  // at least one exists — and a `partial` row can never take it past PARTIAL.
  const profiles = {};
  for (const r of rows) {
    if (!r.profile || !r.admissible) continue;
    const p = profiles[r.profile] || (profiles[r.profile] = { rows: [], status: null, partial: false });
    p.rows.push(r.id);
    if (r.partial) p.partial = true;
  }
  for (const [id, p] of Object.entries(profiles)) {
    const mine = rows.filter((r) => p.rows.includes(r.id));
    if (mine.some((r) => r.status === ROW.FAILED)) p.status = 'FAILED';
    else if (mine.every((r) => r.status === ROW.COVERED)) p.status = p.partial ? 'PARTIAL' : 'COVERED';
    else p.status = 'NOT_RUN';
  }

  return {
    rows,
    chain,
    demo: { present: demo.present, reason: demo.reason, path: demo.path, expected_commit: demo.expected_commit },
    postgres: { attempted: !!connectionString, skip: pgSkip },
    profiles,
  };
}

module.exports = {
  runDataPlane, ROWS, ROW, isGreen, hopEvidence, chainSummary,
};
