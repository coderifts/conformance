'use strict';

/**
 * POINT 8's three states, and the four correlations re-checked OFFLINE.
 *
 * ── WHAT THESE INPUTS ARE, AND ARE NOT ──────────────────────────────────────────────────────
 *
 * The artifacts below are CONSTRUCTED, and that is deliberate — they are inputs to a comparison,
 * not evidence of a run. The distinction is the one this whole surface exists to hold: a
 * hand-built EVIDENCE FIXTURE claims a run happened and is exactly the collage that was closed; a
 * hand-built input to a pure grading function tests the comparison and claims nothing.
 *
 * No fixture in fixtures/recorded/ is touched by this file. When a real bare-Git capture is
 * vendored, it will be graded by the code these tests exercise — with no further code change,
 * which is the point of writing them now.
 *
 * ── THE RENAME ──────────────────────────────────────────────────────────────────────────────
 *
 * `PROVEN` (legacy, every artifact vendored to date) and `TARGET_STATE_TRANSITION_PROVEN` (a
 * bare-Git ref update) are both accepted. Nothing merges on a local ref; calling it MERGE invited
 * a reader to hear "a pull request was merged", which is PATH B.
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

const BASE = 'a'.repeat(40);
const CONTRACT_COMMIT = 'b'.repeat(40);
const BLOB = `sha256:${'c'.repeat(64)}`;

/**
 * A transition block for the CONSTRUCTED cases — a legacy artifact that never had one, given one.
 *
 * NOT used for the negative controls any more, and the reason is a measurement. The profile now
 * ANCHORS the block: the observation is compared field by field against `readback.json` (a
 * root-bound slot) and `expected` against the signed correlation. A block invented out of thin air
 * disagrees with both, so every case built this way would be refused by the anchor before its own
 * mutation was ever reached — eight controls that fire for the wrong reason and stop covering the
 * check they name. The negatives below edit the fixture's REAL block instead.
 */
function transitionBlock(over = {}) {
  return {
    observation: {
      observed_commit: CONTRACT_COMMIT,
      before_commit: BASE,
      contract_blob_digest: BLOB,
      observer_mode: 'read_only',
      observation_source: 'git-object-database',
      ...(over.observation || {}),
    },
    expected: {
      base: BASE,
      contract_commit: CONTRACT_COMMIT,
      contract_blob_digest: BLOB,
      after_payload_digest: BLOB,
      parents: [BASE],
      ...(over.expected || {}),
    },
  };
}

/** Deep-clone the vendored block and apply one edit — the negatives' input. */
function editRealBlock(t, over) {
  const b = JSON.parse(JSON.stringify(t.target_state_transition));
  Object.assign(b.observation, over.observation || {});
  Object.assign(b.expected, over.expected || {});
  t.target_state_transition = b;
}

/** Copy the vendored set, apply an edit, recompute the pin, run the REAL measure. */
function measureWith(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tst-grade-'));
  try {
    for (const f of ARTIFACTS) fs.copyFileSync(path.join(FIXTURE_DIR, f), path.join(dir, f));
    const t = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
    mutate(t);
    fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(t, null, 2));
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

const baseline = new Set(measureContractE2E().missing || []);
const fresh = (r) => (r.missing || []).filter((m) => !baseline.has(m));

describe('POINT 8 — the renamed state', () => {
  it('the LEGACY name is still accepted — every vendored artifact carries it', () => {
    const r = measureWith(() => {});
    assert.ok(!fresh(r).some((m) => /POINT 8/.test(m)),
      `the untouched fixture lost POINT 8:\n${fresh(r).join('\n')}`);
  });

  it('TARGET_STATE_TRANSITION_PROVEN is accepted as the proven state', () => {
    const r = measureWith((t) => {
      t.points.find((p) => p.n === 8).state = 'TARGET_STATE_TRANSITION_PROVEN';
    });
    assert.ok(!fresh(r).some((m) => /POINT 8/.test(m)),
      `the renamed state was refused:\n${fresh(r).join('\n')}`);
  });

  it('CARRIED_UNVERIFIED is NOT proven — bytes arrived, nothing was read from a target', () => {
    const r = measureWith((t) => {
      t.points.find((p) => p.n === 8).state = 'CARRIED_UNVERIFIED';
    });
    assert.ok(fresh(r).some((m) => /POINT 8 is CARRIED_UNVERIFIED/.test(m)), fresh(r).join('\n'));
    assert.notEqual(r.coverage, 'COVERED');
  });

  it('an INVENTED proven-sounding state is refused — the list is closed', () => {
    // Without this, "accepts the renamed state" could have been "accepts anything hopeful".
    const r = measureWith((t) => {
      t.points.find((p) => p.n === 8).state = 'DEFINITELY_PROVEN';
    });
    assert.ok(fresh(r).some((m) => /POINT 8 is DEFINITELY_PROVEN/.test(m)), fresh(r).join('\n'));
  });
});

describe('the four correlations, re-checked offline', () => {
  it('a legacy artifact with NO transition block is graded exactly as before', () => {
    // The check is additive. Retro-failing evidence that predates it would be this measure
    // declaring a rename it did not perform.
    const r = measureWith(() => {});
    assert.deepEqual(fresh(r), []);
  });

  it('the fixture\'s own transition block adds no gap', () => {
    const r = measureWith(() => {});
    assert.deepEqual(fresh(r).filter((m) => /^transition /.test(m)), []);
  });

  it('an INVENTED block is refused by the ANCHOR, before any correlation is reached', () => {
    // The property that makes the negatives below mean something. A block whose every internal
    // field agrees with its neighbours is still refused, because it does not agree with the
    // root-bound readback bytes. Self-consistency is not evidence.
    const r = measureWith((t) => { t.target_state_transition = transitionBlock(); });
    const gaps = fresh(r).filter((m) => m.startsWith('transition '));
    assert.ok(gaps.some((m) => /observation_anchored_/.test(m)),
      `an invented block was not caught by the anchor:\n${gaps.join('\n') || '(none)'}`);
    assert.notEqual(r.coverage, 'COVERED');
  });

  // Each edit changes ONE field of the fixture's real block to a value that is well-formed and
  // wrong. `needle` is the check that must name it — asserting the refusal alone would pass on any
  // gap at all, including one from a neighbouring check that happened to fire.
  const REAL = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'transcript.json'), 'utf8'))
    .target_state_transition;
  for (const [name, over, needle] of [
    ['after_state_token', { observation: { observed_commit: 'd'.repeat(40) } }, /after_state_token/],
    ['blob_digest', { observation: { contract_blob_digest: `sha256:${'e'.repeat(64)}` } }, /blob_digest/],
    ['content_sha256', { expected: { after_payload_digest: `sha256:${'f'.repeat(64)}` } }, /content_sha256/],
    ['single_parent (a merge)', { expected: { parents: [REAL.expected.base, 'e'.repeat(40)] } }, /single_parent/],
    ['single_parent (wrong parent)', { expected: { parents: ['e'.repeat(40)] } }, /single_parent/],
    ['state_transition (did not move)', { observation: { before_commit: REAL.expected.contract_commit } }, /state_transition/],
    ['observer_mode', { observation: { observer_mode: 'read_write' } }, /observer_mode/],
    ['observation_source', { observation: { observation_source: 'hand-written' } }, /observation_source|observer_mode/],
  ]) {
    it(`REFUSED: ${name}`, () => {
      const r = measureWith((t) => editRealBlock(t, over));
      const gaps = fresh(r).filter((m) => m.startsWith('transition '));
      assert.ok(gaps.some((m) => needle.test(m)),
        `no transition gap matched ${needle}:\n${gaps.join('\n') || '(none)'}`);
      assert.notEqual(r.coverage, 'COVERED');
    });
  }

  it('THE CEILING: the parents are RECORDED, not re-derived, and the profile says so', () => {
    // Conformance holds no repository, so it cannot run `git cat-file`. The producer's parent claim
    // is bound by the evidence root — it cannot be edited afterwards — but it is not independently
    // re-read here, and a reader must not take it for the demo's live check.
    const r = measureContractE2E();
    assert.ok((r.does_not_prove || []).some((l) => /RECORDED, not re-measured/.test(l)),
      'the offline limit of the parent check is not stated');
  });
});
