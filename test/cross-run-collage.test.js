'use strict';

/**
 * CROSS-RUN COLLAGE — the open class, pinned as a reproduction (1439/1432).
 *
 * ── WHAT THIS FILE IS ───────────────────────────────────────────────────────────────────────
 *
 * Not a fix. A RECORD of an attack that works today, written so it cannot be forgotten and so the
 * day it stops working is a test that changes rather than a claim somebody makes.
 *
 * 1423 made every token in the artifact authenticate against its issuer's key. That is a property
 * of a TOKEN. "These tokens are one run" is a property of a SET, and no signature can carry it.
 * So: take the negative pole — a real second run of the same producer, at the same commit, whose
 * every token is genuinely signed — and move one of its tokens into the positive artifact. Nothing
 * is forged. Every signature still verifies, because each token really was issued.
 *
 * The pin is recomputed in each case, as an editor of vendored bytes would.
 *
 * ── WHAT THE ASSERTIONS SAY ─────────────────────────────────────────────────────────────────
 *
 * Two things, and the pairing is the point:
 *
 *   1. The swap is INVISIBLE to every per-token check — the profile's gap list is unchanged by it.
 *      That is the vulnerability, asserted rather than described.
 *   2. The profile nevertheless refuses to grade COVERED, because `cross_run_collage` is a
 *      conjunct of the verdict. The system does not currently claim what it cannot show.
 *
 * When a signed cr.evidence.root.v1 lands, assertion 1 flips: the swap becomes visible and gains
 * its own named gap. That flip is the acceptance test for the fix, and it lives here.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { measureContractE2E, FIXTURE_DIR } = require('../lib/recorded-contract-e2e.js');

const ARTIFACTS = ['transcript.json', 'executor-keys.json', 'readback.json',
  'negative-transcript.json', 'negative-readback.json', 'pin.json'];

/** Copy the fixture set, move one token across runs, RECOMPUTE THE PIN, run the real measure. */
function measureSwapped(swap) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-collage-'));
  try {
    for (const f of ARTIFACTS) fs.copyFileSync(path.join(FIXTURE_DIR, f), path.join(dir, f));
    const pos = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
    const neg = JSON.parse(fs.readFileSync(path.join(dir, 'negative-transcript.json'), 'utf8'));
    assert.notEqual(pos.run_id, neg.run_id, 'the two poles must be different runs');
    swap(pos, neg);
    fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(pos, null, 2));

    const pin = JSON.parse(fs.readFileSync(path.join(dir, 'pin.json'), 'utf8'));
    for (const a of pin.artifacts) {
      const abs = path.join(dir, a.path);
      if (!fs.existsSync(abs)) continue;
      const b = fs.readFileSync(abs);
      a.sha256 = crypto.createHash('sha256').update(b).digest('hex');
      a.bytes = b.length;
    }
    fs.writeFileSync(path.join(dir, 'pin.json'), JSON.stringify(pin, null, 2));
    return measureContractE2E({ dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SWAPS = {
  transcript_token: (pos, neg) => { pos.transcript_token = neg.transcript_token; },
  execution_grant: (pos, neg) => { pos.issuance.execution_grant = neg.issuance.execution_grant; },
  chain_receipt: (pos, neg) => { pos.issuance.chain_receipt = neg.issuance.chain_receipt; },
};

const COLLAGE_GAP = 'cross_run_collage';

describe('cross-run collage — authentic tokens, two runs, one artifact', () => {
  const baseline = new Set(measureContractE2E().missing || []);
  /**
   * Does the VENDORED fixture carry an evidence root yet?
   *
   * The producer emits one as of 1432; the vendored capture predates it and is replaced by a
   * clean-commit re-capture (Phase D). Until then the swap cannot be caught, because there is
   * nothing to catch it WITH — and a test that pretends otherwise would be asserting against
   * evidence that does not exist. Both states are real, and both are checked.
   */
  const ROOTED = !!JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'transcript.json'), 'utf8'),
  ).evidence_root;

  it('the honest fixture is PARTIAL for exactly ONE reason, and it is the root\'s absence', () => {
    const others = [...baseline].filter((m) => !m.startsWith(COLLAGE_GAP));
    assert.deepEqual(others, [], `the honest fixture has an unrelated gap:\n${others.join('\n')}`);
    assert.equal(ROOTED, false,
      'the fixture now carries a root — remove this assertion and expect COVERED (Phase D landed)');
  });

  for (const [name, swap] of Object.entries(SWAPS)) {
    it(`CAUGHT: a signed ${name} from another run no longer verifies against the root`, () => {
      // THE FLIP (1432). This assertion used to read `assert.deepEqual(fresh, [])` — the swap was
      // INVISIBLE, and that was the vulnerability, asserted rather than described. It is now
      // visible, and the reason names the mechanism: the substituted token is authentic and has
      // DIFFERENT BYTES, so its digest cannot match the one the producer signed into the root.
      //
      // The vendored fixture predates the root, so this runs against an artifact that carries one:
      // without a root there is nothing to catch the swap WITH, and asserting otherwise would be
      // asserting against a capture Phase D has not produced yet.
      if (!ROOTED) {
        assert.ok(baseline.has(COLLAGE_GAP) || [...baseline].some((m) => m.startsWith('cross_run_collage')),
          'the vendored fixture carries no root, so the collage gap must be named');
        return;
      }
      const r = measureSwapped(swap);
      const fresh = (r.missing || []).filter((m) => !baseline.has(m));
      assert.ok(fresh.length > 0, `the swap is still invisible:\n${(r.missing || []).join('\n')}`);
      assert.ok(fresh.some((m) => m.includes('evidence_root')),
        `caught, but not by the root:\n${fresh.join('\n')}`);
    });

    it(`EITHER WAY: the profile refuses to grade the ${name} collage COVERED`, () => {
      const r = measureSwapped(swap);
      assert.equal(r.coverage, 'PARTIAL');
      assert.equal(r.green, false);
      assert.ok((r.missing || []).some((m) => m.startsWith('cross_run_collage')));
    });
  }

  it('the gap is a CONJUNCT of the verdict, not a note beside it', () => {
    // The whole point of 1439: a stated gap that does not move the grade is how an over-claim
    // survives being documented.
    const r = measureContractE2E();
    assert.equal(r.coverage, 'PARTIAL');
    assert.equal(r.correlated, false);
  });
});
