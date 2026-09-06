#!/usr/bin/env node
'use strict';

/**
 * RELEASE PARITY FOR THE MEASURE ITSELF — install the tarball, then measure from the INSTALL.
 *
 * ── WHY (1423, and why the repo's own tests could not catch it) ─────────────────────────────
 *
 * 0.8.2 published a measure with the P0.1 blindspot: flip one character of
 * `issuance.execution_grant`, recompute the pin, and END_TO_END graded COVERED. Reproduced against
 * the tarball fetched from the registry, not inferred.
 *
 * Every test in the repo passed throughout, and would have kept passing after the fix landed on
 * HEAD but before it was released — because the tests read the WORKING TREE, and a working tree is
 * not what anyone installs. `files`, an ignore rule, a require that resolves to a devDependency, a
 * vendored directory that never shipped: each of those breaks only in the artifact.
 *
 * So this packs, installs into a scratch project, and drives the measure through the INSTALLED
 * module — the same entry point an adopter reaches.
 *
 * ── THE TWO POLES, BOTH REQUIRED ────────────────────────────────────────────────────────────
 *
 *   CLEAN    the honest fixture must read COVERED. Without this, a measure that refuses
 *            everything would "pass" the mutation pole and ship broken.
 *   MUTATED  the auditor's exact mutation — one byte of the execution grant, PLUS a recomputed
 *            pin — must read PARTIAL, naming the signature. The pin recompute is what makes this
 *            a test of authentication rather than of arithmetic: an attacker editing vendored
 *            bytes also owns the file the hash is written in.
 *
 * Exit 0 = the published measure authenticates. Exit 1 = it does not, with the reason named.
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const PKG = require(path.join(REPO, 'package.json'));
const E2E = path.join('fixtures', 'recorded', 'end-to-end');

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  return r;
}

/** Flip the last character — the auditor's mutation, exactly. */
const flipLast = (s) => s.slice(0, -1) + (s[s.length - 1] === 'A' ? 'B' : 'A');

/** Recompute every hash in the pin, as an attacker editing vendored bytes would. */
function repin(dir) {
  const pinPath = path.join(dir, 'pin.json');
  const pin = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
  for (const a of pin.artifacts) {
    const abs = path.join(dir, a.path);
    if (!fs.existsSync(abs)) continue;
    const b = fs.readFileSync(abs);
    a.sha256 = crypto.createHash('sha256').update(b).digest('hex');
    a.bytes = b.length;
  }
  fs.writeFileSync(pinPath, JSON.stringify(pin, null, 2));
}

/**
 * Drive the measure through the installed package in a child process, so a module this repo
 * happens to have loaded cannot stand in for one the tarball forgot to ship.
 */
function measureInstalled(installRoot) {
  const script = `
    const m = require(${JSON.stringify(path.join(installRoot, 'node_modules', PKG.name, 'lib', 'recorded-contract-e2e.js'))});
    const r = m.measureContractE2E();
    process.stdout.write(JSON.stringify({ coverage: r.coverage, tier: r.evidence_tier, green: r.green, missing: r.missing || [] }));
  `;
  const r = run(process.execPath, ['-e', script], { cwd: installRoot });
  if (r.status !== 0) {
    return { error: `${r.stdout}\n${r.stderr}`.trim() };
  }
  try { return JSON.parse(r.stdout); } catch (_) {
    return { error: `the installed measure printed something unparseable:\n${r.stdout}${r.stderr}` };
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-install-'));
try {
  const packed = run('npm', ['pack', '--silent', '--pack-destination', tmp], { cwd: REPO });
  if (packed.status !== 0) {
    process.stderr.write(`npm pack failed:\n${packed.stderr}\n`);
    process.exit(2);
  }
  const tarball = path.join(tmp, path.basename(packed.stdout.trim().split('\n').pop().trim()));
  process.stdout.write(`tarball              : ${path.basename(tarball)} `
    + `(${fs.statSync(tarball).size} bytes)\n`);

  const proj = path.join(tmp, 'consumer');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'package.json'),
    JSON.stringify({ name: 'conformance-install-probe', version: '0.0.0', private: true }, null, 2));
  const install = run('npm', ['install', '--silent', '--no-audit', '--no-fund', tarball], { cwd: proj });
  if (install.status !== 0) {
    process.stderr.write(`installing the tarball failed:\n${install.stdout}${install.stderr}\n`);
    process.exit(2);
  }
  const installed = path.join(proj, 'node_modules', PKG.name);
  process.stdout.write(`installed            : ${PKG.name}@${PKG.version}\n`);

  // The vendored core must have SHIPPED. Absent, the measure silently falls back to whatever it
  // can still do — which on 0.8.2 was "check the pin and one signature".
  const vendor = path.join(installed, 'lib', 'vendor', 'receipt-verifier');
  const needed = ['verify-evidence.js', 'verify-prove-transcript.js', 'verify-grant.js', 'verify.js',
    'arity.js', 'VENDOR.sha256', path.join('keys', 'coderifts-keys.json')];
  const absent = needed.filter((f) => !fs.existsSync(path.join(vendor, f)));
  if (absent.length) {
    process.stdout.write(`  FAIL the installed package has no ${absent.join(', ')} — `
      + 'the published measure cannot authenticate anything\n');
    process.exit(1);
  }
  process.stdout.write(`  OK   lib/vendor/receipt-verifier ships (${needed.length} files)\n`);

  // ── POLE 1: the honest fixture ────────────────────────────────────────────────────────────
  const clean = measureInstalled(proj);
  if (clean.error) {
    process.stdout.write(`  FAIL the installed measure did not run: ${clean.error}\n`);
    process.exit(1);
  }
  const cleanOk = clean.coverage === 'COVERED' && clean.green === true;
  process.stdout.write(`  ${cleanOk ? 'OK  ' : 'FAIL'} CLEAN fixture from the install: `
    + `${clean.coverage} / ${clean.tier} / green=${clean.green}`
    + `${cleanOk ? '' : ` — ${clean.missing.join('; ')}`}\n`);

  // ── POLE 2: the auditor's mutation, inside the installed package ──────────────────────────
  const dir = path.join(installed, E2E);
  const tPath = path.join(dir, 'transcript.json');
  const t = JSON.parse(fs.readFileSync(tPath, 'utf8'));
  t.issuance.execution_grant = flipLast(t.issuance.execution_grant);
  fs.writeFileSync(tPath, JSON.stringify(t, null, 2));
  repin(dir);

  const mutated = measureInstalled(proj);
  if (mutated.error) {
    process.stdout.write(`  FAIL the installed measure did not run on the mutated fixture: ${mutated.error}\n`);
    process.exit(1);
  }
  const named = (mutated.missing || []).some((m) => m.includes('execution_grant signature does not verify'));
  const mutatedOk = mutated.coverage === 'PARTIAL' && mutated.green === false && named;
  process.stdout.write(`  ${mutatedOk ? 'OK  ' : 'FAIL'} MUTATED grant byte + recomputed pin: `
    + `${mutated.coverage} / green=${mutated.green}\n`);
  for (const m of mutated.missing || []) process.stdout.write(`         - ${m}\n`);
  if (mutated.coverage === 'COVERED') {
    process.stdout.write('         ^ THIS IS THE 0.8.2 BLINDSPOT: a byte-mutation with a recomputed '
      + 'pin graded COVERED from the installed package.\n');
  } else if (!named) {
    process.stdout.write('         ^ refused, but NOT for the signature — the mutation was caught by '
      + 'something else, so the authentication path is still unproven.\n');
  }

  if (!cleanOk || !mutatedOk) {
    process.stdout.write('\nTHE PUBLISHED MEASURE DOES NOT AUTHENTICATE. Do not release.\n');
    process.exit(1);
  }
  process.stdout.write('\nthe published measure authenticates: clean COVERED, mutated PARTIAL by signature.\n');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
