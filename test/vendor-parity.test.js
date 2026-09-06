'use strict';

/**
 * The vendored verification core must be receipt-verifier's, byte for byte.
 *
 * 1423 was two verifiers disagreeing about what "checked" means: capability-demo's `prove --check`
 * refused the auditor's mutations while this repo's measure accepted them. Vendoring the shared
 * core fixes that ONCE; this test is what keeps it fixed, because a local edit to a vendored file
 * would rebuild the same divergence under a name that says it cannot happen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VENDOR = path.join(__dirname, '..', 'lib', 'vendor', 'receipt-verifier');
const SOURCE = path.join(process.env.HOME || '', 'receipt-verifier');

function pinned() {
  const text = fs.readFileSync(path.join(VENDOR, 'VENDOR.sha256'), 'utf8');
  return text.split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [sha, file] = l.trim().split(/\s+/); return { sha, file }; });
}

describe('vendored receipt-verifier core', () => {
  it('every vendored file matches VENDOR.sha256', () => {
    const rows = pinned();
    assert.ok(rows.length >= 5, 'the pin must cover the whole module closure');
    for (const { sha, file } of rows) {
      const bytes = fs.readFileSync(path.join(VENDOR, file));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sha, file);
    }
  });

  it('the vendored closure is complete — nothing reaches outside it', () => {
    // A require that escapes the vendor directory would silently pull in whatever this repo
    // happens to have, which is the drift the pin exists to prevent.
    for (const { file } of pinned().filter((r) => r.file.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(VENDOR, file), 'utf8');
      for (const m of src.matchAll(/require\('(\.[^']*)'\)/g)) {
        assert.ok(!m[1].startsWith('../'), `${file} requires outside the vendor dir: ${m[1]}`);
      }
    }
  });

  it('the vendored bytes equal the source repo when it is present', (t) => {
    if (!fs.existsSync(SOURCE)) {
      // HONEST SKIP. The pin above still ran; what cannot run here is the comparison against
      // upstream, and saying so beats a green tick that means "the sibling repo was absent".
      t.skip(`receipt-verifier is not checked out beside this repo (${SOURCE}) — `
        + 'the pin was verified, upstream parity was not');
      return;
    }
    for (const { file } of pinned()) {
      const a = fs.readFileSync(path.join(VENDOR, file));
      const b = fs.readFileSync(path.join(SOURCE, file));
      assert.ok(a.equals(b), `${file} has drifted from receipt-verifier`);
    }
  });

  it('the measure uses the vendored core, not a local re-implementation', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'recorded-contract-e2e.js'), 'utf8');
    assert.match(src, /vendor\/receipt-verifier\/verify-evidence\.js/);
  });
});
