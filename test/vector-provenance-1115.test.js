'use strict';

/**
 * 1115 — nineteen vectors with no runner, and the measurement that decided what to do with them.
 *
 * THE FINDING: the 19 EG-*, EG-A-* and MON-A-* cases cannot execute, and building a runner is the
 * WRONG fix. Their inputs carry a scenario NAME, not a token — 14 of the 19 are `{ scenario }` and
 * nothing else — so a runner here would mint the token it then verifies, in one repository, and
 * agree with itself. receipt-verifier runs the equivalent vectors as signed token BYTES,
 * cross-checked by two independent implementations.
 *
 * These tests pin the MEASUREMENT, not the eventual removal. Removal cannot start here:
 * cases.v1.json is vendored and gated byte-identical from the app.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cases = require('../cases.v1.json');
const AP = require('../lib/assurance-profiles');

const CRYPTO = cases.cases.filter((c) => /^(EG-|MON-)/.test(c.id));

describe('why these vectors cannot run HERE', () => {
  it('there are exactly 19, and none of them is a decide or tool_selection case', () => {
    assert.equal(CRYPTO.length, 19);
    for (const c of CRYPTO) {
      assert.equal(['decide', 'tool_selection'].includes(c.kind), false,
        `${c.id} is kind=${c.kind}, which no shipped subject implements`);
    }
  });

  it('THE REASON REMOVAL BEATS A RUNNER: the input is a scenario NAME, not a token', () => {
    // This is the whole measurement. A subject given `{ scenario: "valid" }` cannot verify
    // anything — it must first MINT a signed token matching that name.
    for (const c of CRYPTO) {
      assert.ok(c.input && typeof c.input.scenario === 'string',
        `${c.id} must carry a scenario name`);
      const s = JSON.stringify(c.input);
      assert.equal(/"token"|"jwt"|"attestation":\s*"[A-Za-z0-9_-]{40,}/.test(s), false,
        `${c.id} must NOT carry a signed token — if it ever does, re-measure this decision`);
    }
  });

  it('14 of the 19 carry ONLY a scenario name — there is nothing else to work from', () => {
    const bare = CRYPTO.filter((c) => Object.keys(c.input || {}).join(',') === 'scenario');
    assert.equal(bare.length, 14);
  });

  it('every shipped subject refuses these kinds — the profile status is earned, not asserted', () => {
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

describe('the recommendation is recorded where the status is', () => {
  it('RECEIPT_CRYPTO stays NOT_RUN and says removal is the recommendation', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.equal(row.status, AP.STATUS.NOT_RUN);
    assert.match(row.why_empty, /THE RECOMMENDATION IS REMOVAL, NOT A RUNNER/);
    assert.match(row.why_empty, /agreeing with itself/);
  });

  it('it names the byte-identical ID overlap that makes this a duplication', () => {
    const row = AP.buildProfileReport().find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.match(row.why_empty, /12 of the 19/);
    assert.match(row.why_empty, /EG-\* 5\/5, EG-A-\* 7\/7/);
    // The 7 MON-A-* are the honest exception: no home in receipt-verifier yet.
    assert.match(row.why_empty, /MON-A-\* have no home there yet/);
  });

  it('THE BLOCKER IS NAMED: removal cannot start in this repository', () => {
    // cases.v1.json is vendored from the app and gated byte-identical, so deleting rows here
    // breaks the app CI. Saying "remove them" without saying where is an instruction that fails.
    const row = AP.buildProfileReport().find((r) => r.id === 'RECEIPT_CRYPTO');
    assert.match(row.why_empty, /REMOVAL CANNOT START IN THIS REPOSITORY/);
    assert.match(row.why_empty, /vendored from the app and gated/);
  });

  it('the README carries the same recommendation as the code, not a friendlier one', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.match(readme, /the recommendation is REMOVAL, not a runner/);
    assert.match(readme, /12 of the 19 already run there under byte-identical IDs/);
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
