'use strict';

/**
 * CROSS-RUN COLLAGE — the open class, pinned as a reproduction (1439/1432).
 *
 * ── WHAT THIS FILE IS ───────────────────────────────────────────────────────────────────────
 *
 * It began as a RECORD of an attack that worked, written so the day it stopped working would be a
 * test that changed rather than a claim somebody made. That day came: a root-bearing capture is
 * vendored, the swap is caught, and the assertions below moved — deliberately, in the direction
 * the header always said they would. The history is left in place because "this used to pass and
 * now it is refused" is the evidence that the fix is a fix; a file rewritten to look as if it had
 * always been closed would prove nothing about the closing.
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
 * A signed cr.evidence.root.v1 has landed, and assertion 1 HAS flipped: the swap is visible and
 * gains its own named gap (`evidence_root: … does not match the root's digest`). Assertion 2 is
 * unchanged and still holds — the refusal never depended on which layer caught it.
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
   * The vendored fixture carries an evidence root. It did not until the bare-Git 7/7 capture was
   * vendored, and this constant is what the file used to branch on — the header above described
   * that interim, and the assertions below now run only in the second state.
   *
   * It is asserted rather than assumed: a fixture that lost its root would otherwise make every
   * "CAUGHT" case below silently untestable instead of failing.
   */
  const ROOTED = !!JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'transcript.json'), 'utf8'),
  ).evidence_root;

  it('the honest fixture is COVERED — the root landed and the gap it named is closed', () => {
    // THE FLIP THIS FILE WAS WRITTEN TO RECORD. It read "PARTIAL for exactly ONE reason, and it is
    // the root's absence", with its own instruction for the day the root arrived. The day arrived.
    //
    // The direction matters: the interim was PARTIAL because nothing could show the tokens were
    // one run. It is COVERED because something now can, and the three cases below prove that thing
    // FIRES — a grade that improved because a check was removed would look identical here, which
    // is why the flip and the catches are asserted together rather than separately.
    assert.equal(ROOTED, true, 'the vendored fixture carries no evidence root');
    assert.deepEqual([...baseline], [],
      `the honest fixture still has a gap:\n${[...baseline].join('\n')}`);
    assert.equal(measureContractE2E().coverage, 'COVERED');
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
      assert.equal(ROOTED, true, 'the vendored fixture carries no root to catch the swap with');
      const r = measureSwapped(swap);
      const fresh = (r.missing || []).filter((m) => !baseline.has(m));
      assert.ok(fresh.length > 0, `the swap is still invisible:\n${(r.missing || []).join('\n')}`);
      assert.ok(fresh.some((m) => m.includes('evidence_root')),
        `caught, but not by the root:\n${fresh.join('\n')}`);
    });

    it(`EITHER WAY: the profile refuses to grade the ${name} collage COVERED`, () => {
      // THE REFUSAL IS UNCHANGED; THE REASON GOT STRONGER, and the assertion moved to follow it
      // rather than being relaxed. It used to require a gap named `cross_run_collage`, which was
      // the profile saying "nothing here binds the set". With a root vendored, that gap does not
      // appear — because the set IS bound, and the swap is refused by a digest that does not
      // match. "We cannot check this" became "we checked, and it failed", so the name had to move.
      //
      // A weaker rewrite was available and is not what this does: dropping to `coverage !==
      // COVERED` alone would still pass if the collage were caught by something incidental, or by
      // nothing at all on a day the baseline had an unrelated gap. The reason is still pinned.
      const r = measureSwapped(swap);
      assert.equal(r.coverage, 'PARTIAL');
      assert.equal(r.green, false);
      const fresh = (r.missing || []).filter((m) => !baseline.has(m));
      assert.ok(fresh.some((m) => m.startsWith('evidence_root:')),
        `the collage was not refused by the root:\n${fresh.join('\n') || '(no new gap at all)'}`);
    });
  }

  it('the gap is a CONJUNCT of the verdict, not a note beside it', () => {
    // The whole point of 1439: a stated gap that does not move the grade is how an over-claim
    // survives being documented.
    //
    // RE-POINTED, and this is the one re-point that had to change its SUBJECT rather than its
    // wording. It used to read the honest fixture, which was PARTIAL, so `correlated === false`
    // came free — the property was true of the artifact, not proved of the code. Now the honest
    // fixture is COVERED, and the only way to still prove "the gap moves the grade" is to CREATE
    // one and watch the grade move. That is a stronger test than the one it replaces, and it is
    // the same assertion the old fixture could not carry.
    const honest = measureContractE2E();
    assert.equal(honest.coverage, 'COVERED');
    assert.equal(honest.correlated, true);

    const collaged = measureSwapped(SWAPS.transcript_token);
    assert.equal(collaged.coverage, 'PARTIAL');
    assert.equal(collaged.correlated, false,
      'the collage is NAMED in `missing` but the verdict did not move — a note beside the grade');
  });
});
