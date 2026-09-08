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
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DOC = fs.readFileSync(path.join(ROOT, 'VERIFY.md'), 'utf8');
const CLI = path.join(ROOT, 'bin', 'coderifts-conformance.js');

const run = (fixtureDir) => spawnSync(process.execPath, [CLI, '--assurance', 'END_TO_END'], {
  encoding: 'utf8',
  env: fixtureDir ? { ...process.env, CODERIFTS_E2E_FIXTURE_DIR: fixtureDir } : process.env,
});

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
