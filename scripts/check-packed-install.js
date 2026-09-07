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
 *   MUTATED  one bit of the execution grant's DECODED signature, PLUS a recomputed pin — must
 *            read PARTIAL, naming the signature. The pin recompute is what makes this a test of
 *            authentication rather than of arithmetic: an attacker editing vendored bytes also
 *            owns the file the hash is written in.
 *   NO-OP    the auditor's original character flip, which on this capture decodes to the SAME
 *            signature. It must still be refused — by the evidence root, which binds the token's
 *            bytes rather than what they decode to. Two layers, each proved by the pole it is the
 *            only one to catch, so neither can quietly stop working behind the other.
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

/**
 * Flip the last character — the auditor's mutation, exactly as they wrote it.
 *
 * KEPT, AND NO LONGER USED AS THE SIGNATURE POLE. Measured on the bare-Git 7/7 capture: an Ed25519
 * signature is 64 bytes and base64url-encodes to 86 characters, of which the last carries FOUR
 * BITS THAT DECODE TO NOTHING. This capture's grant signature ends in 'A', so flipping it yields a
 * different STRING that decodes to the identical 64 bytes — the signature still verifies, and the
 * only thing that changed is the file's bytes.
 *
 * That is why this gate started failing with "refused, but NOT for the signature": it was correct.
 * The mutation had become a no-op against the authentication path, and the pole was proving the
 * evidence root instead. Re-pointing the expected reason would have retired the check this gate
 * exists for, so the mutation was fixed instead of the assertion.
 */
const flipLast = (s) => s.slice(0, -1) + (s[s.length - 1] === 'A' ? 'B' : 'A');

/**
 * Flip ONE BIT of a token's DECODED signature, and refuse to return if that changed nothing.
 *
 * ── WHY NOT `s.slice(0, -1) + 'A'` ──────────────────────────────────────────────────────────
 *
 * An Ed25519 signature is 64 bytes and base64url-encodes to 86 characters. 86 x 6 = 516 bits
 * against 512 real ones, so the FINAL CHARACTER CARRIES FOUR BITS THAT DECODE TO NOTHING. Two
 * characters whose top two bits agree encode the same signature, and 'A'..'P' all have top bits
 * 00 — so the classic "flip the last character to A/B" mutation is a NO-OP whenever the signature
 * ends in one of those sixteen. MEASURED: 16 of 64 characters, one capture in four.
 *
 * When it happens nothing is broken, the verifier accepts, and a control that names the signature
 * path passes without exercising it. It is silent, it depends on which capture is vendored, and it
 * moves on its own the next time a fixture is re-cut.
 *
 * ── SEPARATOR-AWARE, AND THAT IS NOT A DETAIL ───────────────────────────────────────────────
 *
 * Two token shapes live here: `payload.signature` (grants, receipts) and
 * `PREFIX|KID|payload|signature` (prove transcripts, posture receipts). A helper that always split
 * on '.' cut the pipe-joined transcript at the dot inside `cr.prove.transcript.v1` and rebuilt
 * everything after it as one blob — the signature did change, but so did the whole token, so the
 * case proved "a wrecked token is refused" rather than "one flipped signature bit is refused".
 * MEASURED on the vendored capture: 4 pipe-segments in, 1 out.
 *
 * A bare signature (no separator) is handled too: the whole string is the signature.
 */
function flipSignatureByte(token) {
  const sep = token.includes('|') ? '|' : (token.includes('.') ? '.' : null);
  const i = sep === null ? -1 : token.lastIndexOf(sep);
  const sig = Buffer.from(token.slice(i + 1), 'base64url');
  const out = Buffer.from(sig);
  out[0] ^= 0x01;
  // THE SELF-CHECK. A negative control whose mutation might do nothing is not a control, and this
  // is inside the helper so no future case can inherit the defect quietly.
  if (out.equals(sig)) throw new Error('flipSignatureByte: the mutation did not change the signature bytes');
  const flipped = token.slice(0, i + 1) + out.toString('base64url');
  // THE STRUCTURE GUARD, and it counts BOTH separators rather than the one chosen above. Checking
  // only the chosen separator would be the check agreeing with the decision it is meant to audit:
  // pick '.' for a pipe-joined token and the dot-count still matches while the four pipe-segments
  // collapse into one. Measured that way round, on the vendored transcript, before it was written.
  for (const s of ['|', '.']) {
    if (flipped.split(s).length !== token.split(s).length) {
      throw new Error(`flipSignatureByte: the token's ${s}-segment count changed — this mangled the `
        + 'token instead of flipping one signature bit');
    }
  }
  return flipped;
}

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
  const pristine = fs.readFileSync(tPath);
  const t = JSON.parse(pristine.toString('utf8'));
  t.issuance.execution_grant = flipSignatureByte(t.issuance.execution_grant);
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

  // ── POLE 3: the NO-OP flip — a different string, the same signature ───────────────────────
  //
  // This pole exists because pole 2 stopped being able to prove it. The edit below leaves the
  // decoded signature untouched, so the authentication path has nothing to say about it; only the
  // evidence root, which digests the token's bytes, refuses it. Without this the root could stop
  // working and every remaining check would still pass.
  fs.writeFileSync(tPath, pristine);
  const t3 = JSON.parse(pristine.toString('utf8'));
  const flipped = flipLast(t3.issuance.execution_grant);
  const decodesSame = Buffer.from(t3.issuance.execution_grant.split('.').pop(), 'base64url')
    .equals(Buffer.from(flipped.split('.').pop(), 'base64url'));
  t3.issuance.execution_grant = flipped;
  fs.writeFileSync(tPath, JSON.stringify(t3, null, 2));
  repin(dir);

  const noop = measureInstalled(proj);
  // If a future capture's signature ends in a character whose flip DOES reach a real byte, this
  // pole is not a no-op any more and cannot prove what it claims. Say so rather than passing.
  const noopRootNamed = (noop.missing || []).some((m) => m.includes('evidence_root'));
  const noopOk = decodesSame
    ? noop.coverage === 'PARTIAL' && noop.green === false && noopRootNamed
    : noop.coverage === 'PARTIAL' && noop.green === false;
  process.stdout.write(`  ${noopOk ? 'OK  ' : 'FAIL'} NO-OP flip (decodes ${decodesSame ? 'identically' : 'DIFFERENTLY on this capture'}): `
    + `${noop.coverage} / green=${noop.green}${decodesSame ? ' — refused by the root, not the signature' : ''}\n`);
  if (!noopOk) for (const m of noop.missing || []) process.stdout.write(`         - ${m}\n`);
  if (!decodesSame) {
    process.stdout.write('         ^ NOTE: on this capture the character flip reaches a real '
      + 'signature byte, so this pole no longer isolates the root. It still must refuse.\n');
  }

  if (!cleanOk || !mutatedOk || !noopOk) {
    process.stdout.write('\nTHE PUBLISHED MEASURE DOES NOT AUTHENTICATE. Do not release.\n');
    process.exit(1);
  }
  process.stdout.write('\nthe published measure authenticates: clean COVERED, mutated PARTIAL by '
    + 'signature, no-op flip PARTIAL by the evidence root.\n');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
