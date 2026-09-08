'use strict';

/**
 * VERIFY.md IS A PROMISE TO A STRANGER — so it is executed, not proofread.
 *
 * The document tells someone outside these repos exactly what to run and exactly what they will
 * see. A doc that drifted from the tool would be worse than no doc: it would make a person who
 * followed it correctly believe the package is broken, or — the direction that matters — believe
 * a refusal is a pass.
 *
 * So the commands are run here against the SHIPPED bytes, and the strings VERIFY.md quotes are
 * required to be the strings that come back.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DOC = fs.readFileSync(path.join(ROOT, 'VERIFY.md'), 'utf8');
const CLI = path.join(ROOT, 'bin', 'coderifts-conformance.js');

/**
 * THE DOCUMENTED COMMAND, run as documented.
 *
 * MEASURED, and this is why this file missed a release blocker: it drove the CLI through
 * CODERIFTS_E2E_FIXTURE_DIR while VERIFY.md tells a reader to pass `--dir`. The env var worked,
 * the flag was ignored, and every negative here passed against bytes the documented command would
 * never have graded. A doc test that runs a different command than the doc is not a doc test.
 */
const run = (fixtureDir, extra = []) => spawnSync(process.execPath,
  [CLI, '--assurance', 'END_TO_END', ...(fixtureDir ? ['--dir', fixtureDir] : []), ...extra],
  { encoding: 'utf8' });

describe('VERIFY.md command 1 — the full verify passes', () => {
  it('exits 0 and prints the line the document quotes', () => {
    const r = run(null);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const line = 'END_TO_END: COVERED / RECORDED';
    assert.ok(r.stdout.includes(line), r.stdout);
    assert.ok(DOC.includes(line), 'VERIFY.md quotes a different line than the CLI prints');
  });
});

describe('VERIFY.md command 3 — both negatives are REFUSED', () => {
  for (const name of ['two-grant', 'tampered-attestation']) {
    it(`${name} is refused, and refused as UNPROVED rather than disproved`, () => {
      const dir = path.join(ROOT, 'proof', 'negatives', name);
      assert.ok(fs.existsSync(path.join(dir, 'transcript.json')), `${name} is not shipped`);
      const r = run(dir);
      // exit 3 = unproved. This package keeps that apart from exit 1 = disproved on purpose, and
      // the document says so — so the CODE is asserted, not merely "non-zero".
      assert.equal(r.status, 3, `${name} was not refused:\n${r.stdout}${r.stderr}`);
      // ON STDERR, not stdout — a refusal goes to the stream a reader's pipeline treats as the
      // problem. Asserting stdout alone passed the exit-code check and then failed on an empty
      // string, which is how a doc quoting the wrong stream would have shipped.
      assert.ok(`${r.stdout}${r.stderr}`.includes('END_TO_END: PARTIAL'), r.stdout + r.stderr);
    });
  }

  it('the two-grant negative is refused for the reason it EXISTS for', () => {
    // Not merely "it fails". It also trips two later checks it predates, and a negative that only
    // proved "an old capture fails somehow" would stop covering the defect it is named after.
    const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');
    const r = measureContractE2E({ dir: path.join(ROOT, 'proof', 'negatives', 'two-grant') });
    assert.ok(r.missing.some((m) => /binds a different grant id than the verified grant/.test(m)),
      `the two-grant defect is not among the reasons:\n${r.missing.join('\n')}`);
  });

  it('the tampered negative is refused for the SIGNATURE, which is its whole point', () => {
    const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');
    const r = measureContractE2E({ dir: path.join(ROOT, 'proof', 'negatives', 'tampered-attestation') });
    assert.ok(r.missing.some((m) => /ATTEST_INVALID_SIGNATURE/.test(m)),
      `the signature failure is not among the reasons:\n${r.missing.join('\n')}`);
  });
});

describe('the proof folder ships what VERIFY.md points at', () => {
  it('the authorized payload is present, and hashes to what the grant bound', () => {
    // The bytes are the one thing a capture cannot carry — the grant binds their digest. If they
    // drift, command 2 fails on a stranger's machine and nothing here would have noticed.
    const payload = fs.readFileSync(path.join(ROOT, 'proof', 'authorized-payload.yaml'));
    const digest = `sha256:${require('node:crypto').createHash('sha256').update(payload).digest('hex')}`;
    const artifact = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'fixtures', 'recorded', 'end-to-end', 'transcript.json'), 'utf8'));
    const grant = JSON.parse(Buffer.from(
      artifact.issuance.execution_grant.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(digest, grant.after_payload_hash);
    assert.ok(DOC.includes(digest.slice(7, 23)), 'VERIFY.md quotes a different payload digest');
  });

  it('every path VERIFY.md names actually exists', () => {
    for (const rel of ['fixtures/recorded/end-to-end/', 'proof/authorized-payload.yaml',
      'proof/README.md', 'proof/negatives/']) {
      assert.ok(DOC.includes(rel), `VERIFY.md does not mention ${rel}`);
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is named in VERIFY.md but absent`);
    }
  });

  it('VERIFY.md and proof/ are SHIPPED — a stranger installs the package, not the repo', () => {
    // MEASURED: they were not in `files`, so `npx @coderifts/conformance` gave a reader a CLI and
    // no negatives to aim it at. The document would have been true and unreachable.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(pkg.files.includes('VERIFY.md'), 'VERIFY.md is not published');
    assert.ok(pkg.files.some((f) => f.replace(/\/$/, '') === 'proof'), 'proof/ is not published');
  });

  it('the honest ceiling is stated at the top, in the profile\'s own words', () => {
    const head = DOC.slice(0, DOC.indexOf('## 1 ·'));
    for (const token of ['TRUSTED_EXECUTOR', 'NOT_APPLICABLE', 'externally_witnessed  false',
      'RECORDED']) {
      assert.ok(head.includes(token), `VERIFY.md's opening omits ${token}`);
    }
    assert.match(head, /No pull request was merged and no provider witnessed anything/);
  });
});

describe('the --dir acceptance matrix — the release blocker, pinned', () => {
  /**
   * BOTH auditors reproduced the same thing: `--dir` was parsed by nobody, so
   *
   *   --assurance END_TO_END --dir /nonexistent            -> COVERED, exit 0
   *   --assurance END_TO_END --dir proof/negatives/…       -> COVERED, exit 0
   *   --assurance END_TO_END --potato                      -> COVERED, exit 0
   *
   * Every one of those is a FALSE POSITIVE about a directory the command never opened, and the
   * middle one is the published reproduction command. All seven inputs are pinned here because
   * five of them passing is exactly the state that shipped.
   */
  const abs = (rel) => path.join(ROOT, rel);

  it('1 · no --dir grades the EMBEDDED fixture, COVERED, exit 0', () => {
    const r = run(null);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /source: embedded/);
  });

  it('2 · an external POSITIVE directory is COVERED, exit 0', () => {
    const r = run(abs('fixtures/recorded/end-to-end'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /source: external/);
  });

  for (const name of ['two-grant', 'tampered-attestation']) {
    it(`3/4 · ${name} is PARTIAL, exit 3, and names the directory it graded`, () => {
      const dir = abs(`proof/negatives/${name}`);
      const r = run(dir);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      const out = r.stdout + r.stderr;
      assert.ok(out.includes(`evidence_dir: ${dir}`),
        `the verdict does not name the bytes it graded:\n${out}`);
      assert.match(out, /source: external/);
    });
  }

  it('5 · a NONEXISTENT directory is refused — never the embedded fixture', () => {
    const r = run('/nonexistent-capture-dir');
    assert.notEqual(r.status, 0, `a missing directory graded as a pass:\n${r.stdout}`);
    assert.match(r.stdout + r.stderr, /does not exist/);
    // The specific regression: falling back to whatever was lying around.
    assert.doesNotMatch(r.stdout + r.stderr, /source: embedded/);
  });

  it('6 · a directory MISSING required files is refused, and says which', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partial-capture-'));
    try {
      fs.copyFileSync(abs('fixtures/recorded/end-to-end/transcript.json'),
        path.join(dir, 'transcript.json'));
      const r = run(dir);
      assert.notEqual(r.status, 0, r.stdout);
      assert.match(r.stdout + r.stderr, /is missing .*pin\.json|missing (executor-keys|readback)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('7 · an UNKNOWN argument is a usage error, exit 2', () => {
    const r = run(null, ['--potato']);
    assert.equal(r.status, 2, `--potato was ignored:\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /unknown argument: --potato/);
  });

  it('--dir with no value is refused rather than swallowing the next flag', () => {
    const r = spawnSync(process.execPath, [CLI, '--assurance', 'END_TO_END', '--dir'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
  });

  it('VERIFY.md documents --dir, and no longer teaches the env var', () => {
    assert.match(DOC, /--assurance END_TO_END --dir /,
      'VERIFY.md does not show the --dir command a reader must run');
    assert.ok(!DOC.includes('CODERIFTS_E2E_FIXTURE_DIR'),
      'VERIFY.md still teaches the env var, which is not the documented interface');
    assert.match(DOC, /evidence_dir/, 'VERIFY.md does not tell a reader to check evidence_dir');
  });
});
