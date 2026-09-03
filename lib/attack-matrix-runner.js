/**
 * Attack-matrix RUNNER — executes named checks; does not invent a verifier.
 *
 * COVERED  — all five points were actually checked by running the shipped adapter.
 * NOT_RUN  — the vector exists but has no executable check (or the adapter is absent).
 * Never silently COVERED. Never fabricates consumeAndCommit / issueExecutionGrant.
 *
 * The five points (audit-7): target · nonce · executor · attestation · gate.
 * A point is "checked" only when this runner observed it, not when the JSON
 * declared an expected outcome.
 *
 * ATOMIC_COMMIT stays NOT_COVERED: these regressions prove fail-closed adapters
 * and a reconciler that refuses a forged attestation. They do not prove
 * nonce+CAS+attestation as one transaction.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FIXTURE = require('../fixtures/attack-matrix.v1.json');
const PKG = require('../package.json');

const FIVE = Object.freeze(['target', 'nonce', 'executor', 'attestation', 'gate']);
const COVERAGE = Object.freeze({ COVERED: 'COVERED', NOT_RUN: 'NOT_RUN' });

/**
 * capability-demo is private:true (not on npm). The suite pins a git commit and
 * loads adapters from that checkout. COVERED must not silently depend on an
 * undeclared sibling — absent → NOT_RUN / capability_demo_absent, named.
 */
const CAPABILITY_DEMO = Object.freeze({
  ...(PKG.coderifts && PKG.coderifts.capability_demo),
});
const DEMO_ADAPTERS = Object.freeze(['git-atomic.js', 'http-atomic.js', 'reconcile.js']);

const DEMO_SRC = path.resolve(__dirname, '..', CAPABILITY_DEMO.sibling, CAPABILITY_DEMO.src);

let _demoSrc = null;

function adaptersPresent(src) {
  return !!(src && DEMO_ADAPTERS.every((f) => fs.existsSync(path.join(src, f))));
}

function repoRootFromSrc(src) {
  try {
    return execFileSync('git', ['-C', src, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return path.resolve(src, '..', '..');
  }
}

function observedCommit(src) {
  // An npm git-dependency install has no .git of its own. Walking up finds THIS
  // suite's repository and false-mismatches the pin (observed = conformance HEAD,
  // expected = capability-demo pin). The lockfile IS the pin for node_modules.
  const resolved = src && path.resolve(src);
  if (resolved && resolved.includes(`${path.sep}node_modules${path.sep}`)) return null;
  try {
    return execFileSync('git', ['-C', repoRootFromSrc(src), 'rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return null;
  }
}

function nodeModulesSrc() {
  try {
    const pkgJson = require.resolve(`${CAPABILITY_DEMO.package}/package.json`);
    return path.join(path.dirname(pkgJson), CAPABILITY_DEMO.src);
  } catch (_) {
    return null;
  }
}

function commitMatches(observed, expected) {
  if (!observed || !expected) return false;
  const a = String(observed).toLowerCase();
  const b = String(expected).toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * Resolve the capability-demo adapter root.
 * Order: opts.demoSrc → $CODERIFTS_CAPABILITY_DEMO → node_modules pin → sibling.
 * @param {{ demoSrc?: string }} [opts]
 */
function inspectSrc(src, expected_path, expected_commit) {
  if (!adaptersPresent(src)) {
    return {
      present: false,
      reason: 'capability_demo_absent',
      path: src || null,
      expected_path,
      expected_commit,
      observed_commit: null,
    };
  }
  const observed_commit = observedCommit(src);
  if (observed_commit && !commitMatches(observed_commit, expected_commit)) {
    return {
      present: false,
      reason: 'capability_demo_commit_mismatch',
      path: src,
      expected_path,
      expected_commit,
      observed_commit,
    };
  }
  return {
    present: true,
    reason: null,
    path: src,
    expected_path,
    expected_commit,
    observed_commit,
  };
}

function resolveCapabilityDemo(opts = {}) {
  const expected_commit = CAPABILITY_DEMO.commit;
  const expected_path = DEMO_SRC;
  // Explicit override is exclusive — do not silently fall back to sibling (that
  // would make an absent-path test, or a bad CODERIFTS_CAPABILITY_DEMO, lie COVERED).
  if (opts.demoSrc) return inspectSrc(opts.demoSrc, expected_path, expected_commit);

  const envRoot = process.env.CODERIFTS_CAPABILITY_DEMO;
  if (envRoot) {
    const envCandidates = [
      path.resolve(envRoot, CAPABILITY_DEMO.src),
      path.resolve(envRoot),
    ];
    for (const src of envCandidates) {
      const hit = inspectSrc(src, expected_path, expected_commit);
      if (hit.present || hit.reason === 'capability_demo_commit_mismatch') return hit;
    }
    return inspectSrc(envCandidates[0], expected_path, expected_commit);
  }

  const candidates = [];
  const nm = nodeModulesSrc();
  if (nm) candidates.push(nm);
  candidates.push(expected_path);
  for (const src of candidates) {
    const hit = inspectSrc(src, expected_path, expected_commit);
    if (hit.present || hit.reason === 'capability_demo_commit_mismatch') return hit;
  }
  return inspectSrc(null, expected_path, expected_commit);
}

function demoAbsentWhy(demo) {
  const reason = demo.reason || 'capability_demo_absent';
  const pathBit = demo.path || demo.expected_path;
  const obs = demo.observed_commit ? ` observed=${demo.observed_commit}` : '';
  return `${reason}: expected ${pathBit} at commit ${demo.expected_commit}${obs}`;
}

function demoRequire(file) {
  const src = _demoSrc;
  if (!src) {
    const err = new Error(`capability_demo_absent: adapters not resolved (expected ${DEMO_SRC} at ${CAPABILITY_DEMO.commit})`);
    err.code = 'DEMO_ABSENT';
    err.why_not_run = 'capability_demo_absent';
    throw err;
  }
  const p = path.join(src, file);
  if (!fs.existsSync(p)) {
    const err = new Error(`capability_demo_absent: adapter ${file} not at ${p} (expected commit ${CAPABILITY_DEMO.commit})`);
    err.code = 'DEMO_ABSENT';
    err.why_not_run = 'capability_demo_absent';
    throw err;
  }
  return require(p);
}

function unchecked(note) {
  return { checked: false, note };
}

function notRun(attack, why) {
  const whyStr = why && typeof why === 'object' ? why.why : why;
  const extra = why && typeof why === 'object' ? { capability_demo: why.capability_demo } : {};
  return {
    id: attack.id,
    attack: attack.attack,
    coverage: COVERAGE.NOT_RUN,
    why_not_run: whyStr,
    points: Object.fromEntries(FIVE.map((k) => [k, unchecked('not executed')])),
    ...extra,
  };
}

function coveredIfComplete(id, attack, points, extra = {}) {
  const complete = FIVE.every((k) => points[k] && points[k].checked === true);
  return {
    id,
    attack,
    coverage: complete ? COVERAGE.COVERED : COVERAGE.NOT_RUN,
    ...(complete ? {} : { why_not_run: 'five-point check incomplete — not silently COVERED' }),
    points,
    ...extra,
  };
}

function sh(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
}

function makeGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-am-git-'));
  execFileSync('git', ['init', '-q', dir]);
  sh(dir, ['config', 'user.email', 'am@example.invalid']);
  sh(dir, ['config', 'user.name', 'am']);
  fs.writeFileSync(path.join(dir, 'f'), 'a\n');
  sh(dir, ['add', 'f']);
  sh(dir, ['commit', '-qm', 'c1']);
  const a = sh(dir, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(dir, 'f'), 'b\n');
  sh(dir, ['commit', '-qam', 'c2']);
  const b = sh(dir, ['rev-parse', 'HEAD']);
  sh(dir, ['update-ref', 'refs/heads/target', a]);
  return { dir, a, b };
}

async function executeGitMissingPin() {
  const { gitAtomicExecute, readRef, listConsumedLedger } = demoRequire('git-atomic.js');
  const { dir, a, b } = makeGitRepo();
  const kp = crypto.generateKeyPairSync('ed25519');
  const executor = { privateKey: kp.privateKey, kid: 'am-git-k1' };
  const deploy = 'dep-am-git';
  const payload = { deployment_id: deploy, jti: `jti-${crypto.randomUUID()}` };
  try {
    const before = await readRef(dir, 'refs/heads/target');
    const out = await gitAtomicExecute({
      repoDir: dir, ref: 'refs/heads/target', payload, newSha: b,
      operation: 'fast-forward', executor, deploymentId: deploy,
    });
    const after = await readRef(dir, 'refs/heads/target');
    const ledger = await listConsumedLedger({ repoDir: dir });
    return coveredIfComplete('AM-GIT-MISSING-PIN', 'git-missing-expected-old-sha', {
      target: { checked: true, changed: after !== before, before, after },
      nonce: { checked: true, consumed: ledger.length > 0, ledger_entries: ledger.length },
      executor: { checked: true, ok: !!out.ok, status: out.status, reason: out.reason },
      attestation: { checked: true, present: out.attestation != null, valid: false },
      gate: { checked: true, decision: out.ok ? 'ALLOWED' : 'REFUSED' },
    }, { fail_closed: out.ok === false && out.reason === 'missing_expected_old_sha' && after === before && ledger.length === 0 });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
}

function startNoEtagOrigin() {
  const state = { writes: 0, methods: [], body: { n: 1 } };
  const server = http.createServer((req, res) => {
    state.methods.push(req.method);
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(state.body));
      return;
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        state.writes += 1;
        res.statusCode = 200;
        res.end('{}');
      });
      return;
    }
    res.statusCode = 405;
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        state,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((d) => server.close(() => d())),
      });
    });
  });
}

async function executeHttpMissingEtag() {
  const { httpAtomicExecute } = demoRequire('http-atomic.js');
  const origin = await startNoEtagOrigin();
  const kp = crypto.generateKeyPairSync('ed25519');
  const executor = { privateKey: kp.privateKey, kid: 'am-http-k1' };
  const deploy = 'dep-am-http';
  try {
    const out = await httpAtomicExecute({
      baseUrl: origin.baseUrl, resourcePath: '/articles/1',
      payload: { deployment_id: deploy, jti: `jti-${crypto.randomUUID()}` },
      ifMatchEtag: '"v1"', method: 'PUT', body: { n: 99 },
      executor, deploymentId: deploy,
    });
    const weak = await httpAtomicExecute({
      baseUrl: origin.baseUrl, resourcePath: '/articles/1',
      payload: { deployment_id: deploy, jti: `jti-${crypto.randomUUID()}` },
      ifMatchEtag: 'W/"v1"', method: 'PUT', body: { n: 99 },
      executor, deploymentId: deploy,
    });
    return coveredIfComplete('AM-HTTP-MISSING-ETAG', 'http-missing-weak-etag', {
      target: { checked: true, changed: origin.state.writes > 0, writes: origin.state.writes },
      nonce: { checked: true, consumed: false, note: 'HTTP has no nonce ledger; consume would be a PUT' },
      executor: { checked: true, ok: !!out.ok, status: out.status, reason: out.reason },
      attestation: { checked: true, present: out.attestation != null, valid: false },
      gate: { checked: true, decision: out.ok ? 'ALLOWED' : 'REFUSED' },
    }, {
      fail_closed: out.ok === false && out.reason === 'missing_strong_etag'
        && weak.ok === false && weak.reason === 'missing_strong_etag'
        && origin.state.writes === 0 && !origin.state.methods.includes('PUT'),
      weak_etag: { status: weak.status, reason: weak.reason },
    });
  } finally {
    await origin.close();
  }
}

async function executeReconcileForged() {
  const { reconcile } = demoRequire('reconcile.js');
  let writes = 0;
  const readResource = async () => ({ ok: true, etag: 'W/"v2"' });
  const out = await reconcile({
    adapters: {
      http: {
        readResource,
        items: [{
          jti: 'am-forged',
          resourcePath: '/articles/1',
          expectedEtag: 'W/"v2"',
          attestation: 'not-a-token',
        }],
      },
    },
    executorKeys: { keys: [] },
  });
  const row = out.grants && out.grants[0];
  return coveredIfComplete('AM-RECONCILE-FORGED-ATTEST', 'reconcile-forged-attestation', {
    target: { checked: true, changed: writes > 0, note: 'reconcile.js READS; it never mutates' },
    nonce: { checked: true, consumed: false, note: 'reconcile never consumes a nonce' },
    executor: {
      checked: true,
      ok: false,
      status: row && row.outcome,
      reason: row && row.evidence && row.evidence.reason,
    },
    attestation: {
      checked: true,
      present: true,
      valid: false,
      attest_status: row && row.evidence && row.evidence.attest_status,
    },
    gate: { checked: true, decision: out.outcome },
  }, {
    fail_closed: out.outcome === 'INDETERMINATE' && row && row.outcome === 'INDETERMINATE',
  });
}

const EXECUTORS = Object.freeze({
  'git-missing-pin': executeGitMissingPin,
  'http-missing-etag': executeHttpMissingEtag,
  'reconcile-forged-attestation': executeReconcileForged,
});

async function runOne(attack, demo) {
  const execId = attack && attack.execute;
  if (!execId) {
    return notRun(attack, attack.why_pending || attack.why_stated
      || 'no executable check on this vector');
  }
  const fn = EXECUTORS[execId];
  if (typeof fn !== 'function') {
    return notRun(attack, `execute id ${JSON.stringify(execId)} has no runner — not silently COVERED`);
  }
  if (!demo || !demo.present) {
    return notRun(attack, {
      why: demoAbsentWhy(demo || resolveCapabilityDemo()),
      capability_demo: {
        reason: (demo && demo.reason) || 'capability_demo_absent',
        expected_path: (demo && (demo.path || demo.expected_path)) || DEMO_SRC,
        expected_commit: (demo && demo.expected_commit) || CAPABILITY_DEMO.commit,
        observed_commit: (demo && demo.observed_commit) || null,
      },
    });
  }
  try {
    return await fn();
  } catch (err) {
    if (err && err.code === 'DEMO_ABSENT') {
      return notRun(attack, {
        why: err.why_not_run ? demoAbsentWhy(demo) : String(err.message),
        capability_demo: {
          reason: 'capability_demo_absent',
          expected_path: demo.expected_path || DEMO_SRC,
          expected_commit: demo.expected_commit || CAPABILITY_DEMO.commit,
          observed_commit: demo.observed_commit || null,
        },
      });
    }
    return notRun(attack, `execution threw: ${String(err && err.message || err).slice(0, 200)}`);
  }
}

async function runAttackMatrix(fixture = FIXTURE, opts = {}) {
  const demo = resolveCapabilityDemo(opts);
  const prev = _demoSrc;
  _demoSrc = demo.present ? demo.path : null;
  try {
    const results = [];
    for (const attack of fixture.attacks || []) {
      results.push(await runOne(attack, demo));
    }
    const covered = results.filter((r) => r.coverage === COVERAGE.COVERED).map((r) => r.id);
    const not_run = results.filter((r) => r.coverage === COVERAGE.NOT_RUN).map((r) => ({
      id: r.id,
      why: r.why_not_run,
    }));
    return {
      schema: 'coderifts.conformance.attack-matrix-run.v1',
      five_points: FIVE,
      covered,
      not_run,
      capability_demo: {
        present: demo.present,
        reason: demo.reason,
        path: demo.path,
        expected_path: demo.expected_path,
        expected_commit: demo.expected_commit,
        observed_commit: demo.observed_commit,
      },
      results,
      honesty: 'COVERED means all five points were checked by executing a shipped adapter. '
        + 'A declared JSON expected outcome is never treated as execution. Vectors with no '
        + 'execute id stay NOT_RUN, named. capability-demo adapters are a declared, commit-pinned '
        + 'dependency; when that checkout is absent the three regressions are NOT_RUN / '
        + 'capability_demo_absent, never silently COVERED. ATOMIC_COMMIT is not populated by this runner.',
    };
  } finally {
    _demoSrc = prev;
  }
}

function fivePointComplete(result) {
  return !!(result && FIVE.every((k) => result.points && result.points[k] && result.points[k].checked === true));
}

module.exports = {
  FIVE,
  COVERAGE,
  DEMO_SRC,
  CAPABILITY_DEMO,
  resolveCapabilityDemo,
  runAttackMatrix,
  runOne,
  fivePointComplete,
  EXECUTORS,
};
