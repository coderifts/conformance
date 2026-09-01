'use strict';

/**
 * 1115 → 0.4.0 — nineteen vectors with no runner, and what was finally done with them.
 *
 * THE MEASUREMENT (kept, because it is the reason): the EG-* / EG-A- * / MON-A-* cases could
 * not execute here, and building a runner was the WRONG fix. Their inputs carry a scenario
 * NAME, not a token, so a runner here would have minted the token it then verified — one
 * repository agreeing with itself. receipt-verifier runs the equivalent vectors as signed
 * token BYTES through two independent implementations, and the app runs them against the
 * real verify functions.
 *
 * THE ACTION (0.4.0): they are gone from the vendored case file. Removal could not start
 * here — cases.v1.json is vendored from the app and gated byte-identical — so it began at
 * the app-canonical copy and this repo followed. These tests now pin that the retirement
 * HAPPENED and STAYS done, and that the profile row was kept rather than deleted.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cases = require('../cases.v1.json');
const AP = require('../lib/assurance-profiles');

const CRYPTO = cases.cases.filter((c) => /^(EG-|MON-)/.test(c.id));

describe('the retirement happened, and it stays done', () => {
  it('NO receipt-crypto case remains in the vendored case file', () => {
    assert.deepEqual(CRYPTO.map((c) => c.id), [],
      'a receipt-crypto vector is back in cases.v1.json — it belongs in the app-canonical '
      + 'receipt-crypto-vectors.v1.json, not here');
  });

  it('every remaining case is a kind a shipped subject can actually execute', () => {
    // The failure this file was opened for: a third of the case file was data with no runner.
    // The invariant that prevents its return is simply that there are no other kinds.
    for (const c of cases.cases) {
      assert.ok(['decide', 'tool_selection'].includes(c.kind),
        `${c.id} is kind=${c.kind}, which no shipped subject implements`);
    }
  });

  it('every case is mapped, so a new one cannot arrive unaccounted for', () => {
    const mapped = new Set(
      AP.VECTOR_MAP.filter((v) => v.source === 'cases.v1.json').map((v) => v.vector),
    );
    for (const c of cases.cases) {
      assert.ok(mapped.has(c.id), `${c.id} is in the case file but in no profile`);
    }
  });

  it('every shipped subject still refuses those kinds — no runner slipped in', () => {
    const subjectsDir = path.join(__dirname, '..', 'subjects');
    const files = fs.readdirSync(subjectsDir).filter((f) => f.endsWith('.js'));
    assert.ok(files.length >= 4);
    for (const f of files) {
      const src = fs.readFileSync(path.join(subjectsDir, f), 'utf8');
      for (const kind of ['execution_grant', 'execution_attestation', 'monitoring_attestation']) {
        assert.equal(src.includes(`'${kind}'`), false,
          `subjects/${f} appears to handle ${kind}; if a runner landed, RECEIPT_CRYPTO must be re-graded`);
      }
    }
  });
});

describe('the row was KEPT, and it says where the proof lives', () => {
  it('RECEIPT_CRYPTO is NOT_COVERED with zero vectors — and is still one of the seven', () => {
    const report = AP.buildProfileReport();
    assert.equal(report.length, 7, 'the retirement removes vectors, never a claim');
    const row = report.find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.equal(row.status, AP.STATUS.NOT_COVERED);
    assert.equal(row.vectors, 0);
    assert.equal(row.runnable, 0);
    assert.equal(row.green, false, 'an empty profile is never green');
  });

  it('DELETING the row is refused by this test, not by convention', () => {
    // Omission would remove the evidence the claim was ever contemplated — the same
    // reasoning that made "0/0" unacceptable as a rendering.
    assert.ok(AP.PROFILE_IDS.includes('RECEIPT_CRYPTO'));
  });

  it('why_empty names the retirement, the blocker, and BOTH homes the vectors moved to', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.match(row.why_empty, /RETIRED FROM THIS SUITE/);
    // The blocker, because "remove them" without saying where is an instruction that fails.
    assert.match(row.why_empty, /THE REMOVAL COULD NOT START HERE/);
    assert.match(row.why_empty, /vendored from the app and gated/);
    // Both homes, named.
    assert.match(row.why_empty, /receipt-crypto-vectors\.v1\.json/);
    assert.match(row.why_empty, /receipt-verifier as SIGNED TOKEN BYTES/);
    // And the reason a runner here was refused.
    assert.match(row.why_empty, /agreeing with itself/);
  });

  it('NOT COVERED is scoped to this suite, never stated as "unproven"', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.match(row.why_empty, /not a claim that the property is unproven/i);
  });

  it('the README carries the same account as the code, not a friendlier one', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.match(readme, /RETIRED/);
    assert.match(readme, /receipt-verifier/);
  });
});

describe('1105 — the canary is a DESIGN, and the file says so', () => {
  const doc = fs.readFileSync(
    path.join(__dirname, '..', 'docs', '1105-negative-canary-design.md'), 'utf8',
  );

  it('states plainly that nothing is implemented', () => {
    assert.match(doc, /\*\*Nothing here is implemented\.\*\*/);
  });

  it('the refusal signal is a MEASURED status code, not an assumption', () => {
    assert.match(doc, /405 — Method Not Allowed if merge cannot be performed/);
    assert.match(doc, /passes on 405 and fails on 200/);
  });

  it('names the ephemeral-base trap rather than proposing it', () => {
    // The tempting design is an ephemeral base branch. Measured against ruleset ref conditions,
    // that produces a green light that means nothing.
    assert.match(doc, /green light that means nothing/);
    assert.match(doc, /~DEFAULT_BRANCH/);
  });

  it('the judgement is OPT-IN, and the cost is stated in the consent prompt', () => {
    assert.match(doc, /OPT-IN AT INSTALL TIME, never routine/);
    assert.match(doc, /burns a\s*\n?number, runs your CI, and leaves a closed PR behind/);
  });

  it('the proves/does-not-prove split names the bypass actor and the attribution gap', () => {
    assert.match(doc, /a bypass actor added\s*\n?tomorrow|bypass actor added/i);
    assert.match(doc, /That the refusal was ours/);
    assert.match(doc, /one moment, on one repository, on one ref/);
  });

  it('the ceiling is repeated, not softened, for the artefact most likely to be over-read', () => {
    assert.match(doc, /ONE NAMED SHAPE fails at the recorded version, never that the class is\s*\n?closed/);
  });
});
