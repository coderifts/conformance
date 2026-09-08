'use strict';

/**
 * ASSURANCE PROFILES — the split, the mapping, and the empty-profile rendering rule.
 *
 * The point of these tests is not that the current statuses are what they are; those will move as
 * vectors get written. It is that an EMPTY profile can never be presented as a pass, in any format
 * this suite produces, and that the mapping cannot silently drop or double-count a vector.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AP = require('../lib/assurance-profiles');
const cases = require('../cases.v1.json');

const BIN = path.join(__dirname, '..', 'bin', 'coderifts-conformance.js');
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

describe('the mapping is total, exclusive, and honest about how each vector runs', () => {
  it('every case in cases.v1.json is mapped to exactly one profile', () => {
    const ids = cases.cases.map((c) => c.id);
    const mapped = AP.VECTOR_MAP.filter((v) => v.source === 'cases.v1.json').map((v) => v.vector);
    for (const id of ids) {
      assert.equal(mapped.filter((m) => m === id).length, 1, `${id} must be mapped exactly once`);
    }
    // and nothing is mapped that does not exist — a typo would silently drop a case
    for (const m of mapped) assert.ok(ids.includes(m), `${m} is mapped but not in cases.v1.json`);
  });

  it('no vector appears under two profiles — a double count inflates both', () => {
    const seen = AP.VECTOR_MAP.map((v) => v.vector);
    const dupes = seen.filter((v, i) => seen.indexOf(v) !== i);
    assert.deepEqual(dupes, [], `mapped more than once: ${dupes.join(', ')}`);
  });

  it('every mapping names a real profile id', () => {
    for (const v of AP.VECTOR_MAP) {
      assert.ok(AP.PROFILE_IDS.includes(v.profile), `${v.vector} -> unknown profile ${v.profile}`);
    }
  });

  it('a `runner` claim matches what the subjects can actually execute', () => {
    // THE CLAIM THAT MATTERS: RECEIPT_CRYPTO is NOT_RUN because the subjects throw on its kinds.
    // If a subject later learns those kinds, this test forces the mapping to admit it.
    const RUNNABLE_KINDS = new Set(['decide', 'tool_selection']);
    for (const v of AP.VECTOR_MAP.filter((x) => x.source === 'cases.v1.json')) {
      const c = cases.cases.find((x) => x.id === v.vector);
      const executable = RUNNABLE_KINDS.has(c.kind);
      assert.equal(v.runner !== 'none', executable,
        `${v.vector} is kind=${c.kind}; runner claim "${v.runner}" disagrees with what subjects implement`);
    }
  });

  it('the unplaced vector is RECORDED with a reason, not forced into the nearest profile', () => {
    assert.ok(AP.UNPLACED.length >= 1);
    for (const u of AP.UNPLACED) {
      assert.ok(u.why && u.why.length > 60, 'an unplaced vector must say why none of the seven fits');
      assert.ok(u.proposal && u.proposal.length > 40, 'and what sharpening would place it');
      const mapped = AP.VECTOR_MAP.some((v) => v.vector === u.vector);
      assert.equal(mapped, false, 'an unplaced vector must not also be counted in a profile');
    }
  });

  it('suite self-integrity tests count toward NO profile', () => {
    // Letting the suite score itself for describing itself is inflation by another name.
    assert.ok(AP.META_TESTS.count > 0);
    assert.ok(AP.META_TESTS.why_not_a_profile.length > 60);
    for (const g of AP.META_TESTS.groups) {
      assert.equal(AP.VECTOR_MAP.some((v) => v.vector === g), false);
    }
  });
});

describe('an empty profile can never render as a pass', () => {
  it('status is derived from the vectors, never asserted by hand', () => {
    const overlay = new Set([
      'RECEIPT_CRYPTO', 'CREDENTIAL_BOUNDARY', 'ATOMIC_COMMIT',
      'PROVIDER_ENFORCED', 'END_TO_END',
    ]);
    for (const r of AP.buildProfileReport()) {
      const mapped = AP.VECTOR_MAP.filter((v) => v.profile === r.id);
      if (!overlay.has(r.id)) {
        assert.equal(r.coverage, AP.coverageStatus(mapped), r.id);
        assert.equal(r.evidence_tier, AP.evidenceTierFromVectors(mapped), r.id);
      }
      assert.equal(r.green, AP.isGreen(r), r.id);
      assert.equal(r.status, r.coverage, `${r.id} status must alias coverage, never mix the axes`);
    }
  });

  it('every mapped vector names a polarity so COVERED cannot be claimed without a pair', () => {
    for (const v of AP.VECTOR_MAP) {
      assert.ok(['positive', 'negative', 'pair'].includes(v.polarity),
        `${v.vector} missing polarity`);
    }
  });

  it('COVERED BITES: positives alone are not coverage — mutate the pair, status falls', () => {
    assert.equal(AP.coverageStatus([]), AP.STATUS.NOT_COVERED);
    assert.equal(AP.coverageStatus([
      { vector: 'only-pos', runner: 'test', polarity: 'positive' },
    ]), AP.STATUS.NOT_COVERED);
    assert.equal(AP.coverageStatus([
      { vector: 'only-neg', runner: 'test', polarity: 'negative' },
    ]), AP.STATUS.NOT_COVERED);
    assert.equal(AP.coverageStatus([
      { vector: 'data', runner: 'none', polarity: 'negative' },
    ]), AP.COVERAGE.NOT_COVERED);
    assert.equal(AP.evidenceTierFromVectors([
      { vector: 'data', runner: 'none', polarity: 'negative' },
    ]), AP.EVIDENCE_TIER.NOT_RUN);
    assert.equal(AP.coverageStatus([
      { vector: 'pos', runner: 'test', polarity: 'positive' },
      { vector: 'neg', runner: 'test', polarity: 'negative' },
    ]), AP.STATUS.COVERED);
    assert.equal(AP.coverageStatus([
      { vector: 'both', runner: 'test', polarity: 'pair' },
    ]), AP.STATUS.COVERED);
  });

  it('the live COVERED profiles actually have both polarities', () => {
    for (const r of AP.buildProfileReport()) {
      if (r.coverage !== AP.COVERAGE.COVERED) continue;
      assert.ok(r.positive > 0, `${r.id} COVERED with no positive`);
      assert.ok(r.negative > 0, `${r.id} COVERED with no negative`);
    }
  });

  it('THE GUARD BITES: a hand-forged green empty profile is refused, not printed', () => {
    // REWRITTEN 2026-09-12. It used to forge by marking every non-COVERED row green — which
    // silently became a no-op the day every profile reached COVERED, and a guard-test that tests
    // nothing is worse than none. The forged row is now constructed outright, so this asserts the
    // GUARD rather than today's coverage.
    const forged = AP.buildProfileReport().map((r) => ({ ...r }));
    forged.push({
      ...forged[0],
      id: 'FORGED_EMPTY',
      coverage: AP.COVERAGE.NOT_COVERED,
      green: true,
      vectors: 0,
      runnable: 0,
      positive: 0,
      negative: 0,
    });
    assert.throws(() => AP.assertNoGreenEmpty(forged), /marked green — refusing to render/);
    assert.throws(() => AP.renderProfileTable(forged), /refusing to render/);
    assert.throws(() => AP.renderProfileJson(forged), /refusing to render/);
  });

  it('a status inconsistent with its runnable count is refused too', () => {
    // NOT_RUN + COVERED with runnable vectors is the conflation the two-axis split forbids.
    const forged = AP.buildProfileReport().map((r) => (
      r.id === 'END_TO_END'
        ? {
          ...r,
          coverage: AP.COVERAGE.COVERED,
          status: AP.COVERAGE.COVERED,
          evidence_tier: AP.EVIDENCE_TIER.NOT_RUN,
          green: true,
          vectors: 3,
          runnable: 3,
        }
        : r));
    assert.throws(() => AP.assertNoGreenEmpty(forged), /inconsistent|refusing to render/);
  });

  it('MODELLED COVERED is refused at render, not printed as a pass', () => {
    const forged = AP.buildProfileReport().map((r) => (
      r.id === 'PROVIDER_ENFORCED'
        ? {
          ...r,
          coverage: AP.COVERAGE.COVERED,
          status: AP.COVERAGE.COVERED,
          evidence_tier: AP.EVIDENCE_TIER.MODELLED,
          green: true,
        }
        : r));
    assert.throws(() => AP.assertNoGreenEmpty(forged), /MODELLED cannot be COVERED|refusing to render/);
  });

  it('TERMINAL: no empty profile is printed as a ratio, and 0/0 appears nowhere', () => {
    const out = AP.renderProfileTable();
    assert.equal(/\b0\s*\/\s*0\b/.test(out), false, '0/0 reads exactly like a pass');
    for (const r of AP.buildProfileReport()) {
      if (r.coverage === AP.COVERAGE.COVERED) continue;
      const line = out.split('\n').find((l) => l.includes(r.id) && /COVERED|NOT RUN|PARTIAL/.test(l));
      assert.ok(line, `${r.id} must appear in the table`);
      assert.equal(/\b\d+\s*\/\s*\d+\b/.test(line), false, `${r.id} row must not carry a ratio`);
    }
  });

  it('TERMINAL: the two-axis summary is a coverage count plus an evidence breakdown, not a pass-rate', () => {
    const out = AP.renderProfileTable();
    const axis = out.split('\n').find((l) => /PROFILE COVERAGE/.test(l));
    assert.ok(axis, 'the two-axis line must exist');
    assert.match(axis, /PROFILE COVERAGE \d+\/7/);
    assert.match(axis, /EVIDENCE \d+ LIVE \+ \d+ RECORDED \+ \d+ MODELLED/);
    assert.match(axis, /OVERALL RECORDED/);
    assert.match(axis, /FULL LIVE false/);
    const counts = out.split('\n').find((l) => /covered ·/.test(l));
    assert.ok(counts);
    assert.match(counts, /of 7 profiles/);
  });

  it('TERMINAL: every non-covered profile prints WHY, not just that it is empty', () => {
    const out = AP.renderProfileTable();
    for (const r of AP.buildProfileReport()) {
      if (r.coverage === AP.COVERAGE.COVERED && r.green) continue;
      assert.ok(out.includes(`${r.id} — `), `${r.id} must have an explanation block`);
    }
  });

  it('JSON: green is explicit per profile and never true for a non-covered one', () => {
    const j = AP.renderProfileJson();
    for (const p of j.profiles) {
      assert.equal(typeof p.green, 'boolean', 'a consumer must not infer pass from a missing field');
      if (p.coverage !== 'COVERED') {
        assert.equal(p.green, false);
        assert.ok(p.why_not_covered && p.why_not_covered.length > 80,
          `${p.id} must carry its reason in the machine shape too`);
      }
      assert.ok(p.coverage);
      assert.ok(p.evidence_tier);
    }
  });

  it('JSON: carries no suite-wide pass/total that could be averaged', () => {
    const j = AP.renderProfileJson();
    for (const k of Object.keys(j.summary)) {
      assert.equal(/^(passed|failed|total|pass_rate|score)$/.test(k), false,
        `summary.${k} invites a ratio over unequal claims`);
    }
  });

  it('JSON: the ceiling travels with the report', () => {
    assert.match(AP.renderProfileJson().ceiling, /ONE NAMED SHAPE/);
  });

  it('JSON: count fields name their units — present is unique vectors, pos/neg are polarity occurrences', () => {
    const j = AP.renderProfileJson();
    assert.ok(j.field_docs);
    assert.match(j.field_docs.vectors_present, /Unique vectors/i);
    assert.match(j.field_docs.vectors_positive, /Polarity occurrences/);
    assert.match(j.field_docs.vectors_positive, /pair/);
    assert.match(j.field_docs.vectors_negative, /Polarity occurrences/);
    assert.match(j.field_docs.vectors_positive, /need not equal/);

    const dl = j.profiles.find((p) => p.id === 'DECISION_LOGIC');
    const pairN = AP.VECTOR_MAP.filter((v) => v.profile === 'DECISION_LOGIC' && v.polarity === 'pair').length;
    assert.equal(pairN, 1, 'DECISION_LOGIC has the model-acceptance pair vector');
    assert.equal(dl.vectors_present, 15);
    assert.equal(dl.vectors_positive, 5);
    assert.equal(dl.vectors_negative, 11);
    assert.equal(
      dl.vectors_present + pairN,
      dl.vectors_positive + dl.vectors_negative,
      'present + pair-count === polarity-occurrence sum',
    );

    const table = AP.renderProfileTable();
    assert.match(table, /vectors_present = unique vectors/);
    assert.match(table, /polarity occurrences/);
  });

  it('--help names the count-field units', () => {
    const r = run(['--help']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /vectors_present = unique vectors/);
    assert.match(r.stdout, /polarity occurrences/);
  });
});


/**
 * A PRIVATE COPY of the vendored capture, for a test that needs to break one.
 *
 * ── WHY EVERY MUTATION NEEDS ITS OWN DIRECTORY ──────────────────────────────────────────────
 *
 * MEASURED: the full suite failed roughly one run in four, and the failures moved. Three tests in
 * this file rewrote `fixtures/recorded/end-to-end/transcript.json` (and renamed a file out of it)
 * and restored them in a `finally` — correct in isolation, and a shared mutable global once
 * anything else read the same directory concurrently. A neighbour reading the default fixture
 * mid-mutation saw a broken capture and reported a failure that belonged to nobody.
 *
 * A restore-in-finally cannot fix that: the window is the whole body, not the failure path. The
 * only fix is not to touch the shared bytes at all.
 */
function withCapture(mutate) {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const os2 = require('node:os');
  const src = path2.join(__dirname, '..', 'fixtures', 'recorded', 'end-to-end');
  const dir = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'cr-capture-'));
  for (const f of fs2.readdirSync(src)) fs2.copyFileSync(path2.join(src, f), path2.join(dir, f));
  if (mutate) mutate(dir);
  return {
    dir,
    cleanup: () => fs2.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Recompute the pin over a copy, exactly as an editor of vendored bytes would. */
function repin(dir) {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const crypto2 = require('node:crypto');
  const pPath = path2.join(dir, 'pin.json');
  const pin = JSON.parse(fs2.readFileSync(pPath, 'utf8'));
  for (const a of pin.artifacts) {
    const abs = path2.join(dir, a.path);
    if (!fs2.existsSync(abs)) continue;
    const b = fs2.readFileSync(abs);
    a.sha256 = crypto2.createHash('sha256').update(b).digest('hex');
    a.bytes = b.length;
  }
  fs2.writeFileSync(pPath, JSON.stringify(pin, null, 2));
}

describe('the CLI gates on a single profile with a distinct exit code', () => {
  it('--assurance on a COVERED profile exits 0', () => {
    const r = run(['--assurance', 'DECISION_LOGIC']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('--assurance on END_TO_END exits 0 — one grant, and now shown to be ONE RUN', () => {
    // THIRD STATE OF THIS ASSERTION, and each move was a measurement rather than a decision.
    //
    //   correlated run vendored          → exit 0   the contract halves matched
    //   continuity gate added            → exit 3   it saw TWO grants (server d33032a5,
    //                                               executor d26dbacc): an authorize AND an
    //                                               execution, never one covering the other
    //   challenge-first v2 ATOMIC grant  → exit 0   the executor consumed the grant the SERVER
    //                                               issued; issued, consumed and attested jti are
    //                                               one value, re-checked here, not read as a claim
    //
    // What makes this exit 0 different from the first one is that the gap the middle state named
    // is closed, not removed: the same check still runs and the neighbouring test proves it bites.
    // FOURTH STATE, and each move was a measurement (1439). The authorization-continuity gap is
    // closed and stays closed; what reopened the grade is a DIFFERENT class the auditor found:
    // every token here is authenticated individually, and a genuinely signed token taken from
    // another run of the same producer is still accepted. Reproduced three ways.
    //
    // Exit 3 was unproved, not disproved — the contract-publish chain held; what was not shown was
    // that these tokens are one run. The comment above promised this assertion would move back to
    // 0 when a producer emitted a root. It did.
    //
    //   fifth state, bare-Git 7/7 capture → exit 0   the artifact carries a signed
    //                                                cr.evidence.root.v1, POINT 8 is filled from
    //                                                an observed target-state transition, and the
    //                                                collage gap is closed rather than removed.
    //
    // AND THAT DISTINCTION IS ASSERTED, not asserted-about. An exit code of 0 is what a profile
    // that stopped checking would also print, so the reason is pinned twice: the measure must name
    // ZERO gaps (not "no collage gap"), and the neighbouring cross-run-collage suite proves the
    // check that closed it still refuses a swap. A green code with a silent check is the failure
    // mode this pairing exists to make impossible.
    const r = run(['--assurance', 'END_TO_END']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(`${r.stdout}${r.stderr}`, /COVERED/);
    const m = require('../lib/recorded-contract-e2e.js').measureContractE2E();
    assert.deepEqual(m.missing || [], [],
      `exit 0 with a named gap:\n${(m.missing || []).join('\n')}`);
    assert.ok((m.present || []).some((x) => x.includes('cr.evidence.root.v1')),
      'the collage gap closed without a root being present — that is removal, not closure');
  });

  it('THE BITE: a transcript whose consumed jti is not the issued one drops to PARTIAL', () => {
    // COVERED must mean the continuity check FIRED, not that it was skipped. Measured by breaking
    // exactly one field — ON A PRIVATE COPY. The earlier version broke the SHARED fixture and put
    // it back in a `finally`, which is correct alone and a race with every concurrent reader.
    const { dir, cleanup } = withCapture((d) => {
      const fs2 = require('node:fs');
      const path2 = require('node:path');
      const tPath = path2.join(d, 'transcript.json');
      const t = JSON.parse(fs2.readFileSync(tPath, 'utf8'));
      t.continuity.identities.consumed_jti = '00000000-0000-4000-8000-000000000000';
      fs2.writeFileSync(tPath, JSON.stringify(t));
      repin(d);
    });
    try {
      const m = require('../lib/recorded-contract-e2e.js').measureContractE2E({ dir });
      assert.ok((m.missing || []).some((x) => x.includes('authorization_not_continuous')),
        `the continuity check did not fire:\n${(m.missing || []).join('\n')}`);
      // The subprocess gets the SAME private directory — the documented `--dir`, not an env var.
      assert.equal(run(['--assurance', 'END_TO_END', '--dir', dir]).status, 3,
        'a discontinuous capture must be unproved, not green');
    } finally {
      cleanup();
    }
    // AND the untouched shared capture is still green — the round trip that proves the bite is the
    // mutation's doing, now without ever having written to the shared bytes.
    assert.equal(run(['--assurance', 'END_TO_END']).status, 0, 'the shared fixture must be intact');
  });

  it('removing evidence never improves a verdict — the property that holds at any coverage', () => {
    // Written to survive BOTH worlds, and it now runs in the second one: END_TO_END is COVERED,
    // so removing the negative pole is what exercises the path. Asserting a fixed code would be
    // brittle; "removing evidence cannot make it greener" is the invariant, and it is the one
    // that matters.
    // BOTH SIDES ON PRIVATE COPIES — the intact one too, so `before` and `without` describe the
    // same bytes and neither depends on the shared fixture holding still while a neighbour reads it.
    const intact = withCapture();
    const stripped = withCapture((d) => {
      require('node:fs').rmSync(require('node:path').join(d, 'negative-transcript.json'));
    });
    let before;
    let without;
    try {
      before = run(['--assurance', 'END_TO_END', '--dir', intact.dir]).status;
      without = run(['--assurance', 'END_TO_END', '--dir', stripped.dir]).status;
    } finally {
      intact.cleanup();
      stripped.cleanup();
    }
    assert.notEqual(without, 0, 'a profile whose evidence is missing must not be green');
    assert.ok(without >= before, 'removing evidence must never improve the verdict');
    assert.equal(run(['--assurance', 'END_TO_END']).status, before,
      'the shared fixture must be untouched and grade the same');
  });

  it('--assurance PROVIDER_ENFORCED exits 0 in recorded mode (COVERED / RECORDED)', () => {
    const r = run(['--assurance', 'PROVIDER_ENFORCED']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /COVERED \/ RECORDED/);
  });

  it('--assurance ATOMIC_COMMIT and CREDENTIAL_BOUNDARY exit 0 in recorded mode', () => {
    const atom = run(['--assurance', 'ATOMIC_COMMIT']);
    const cred = run(['--assurance', 'CREDENTIAL_BOUNDARY']);
    assert.equal(atom.status, 0, atom.stdout + atom.stderr);
    assert.equal(cred.status, 0, cred.stdout + cred.stderr);
    assert.match(atom.stdout, /COVERED \/ RECORDED/);
    assert.match(cred.stdout, /COVERED \/ RECORDED/);
  });

  it('--assurance on RECEIPT_CRYPTO exits 0 in recorded mode (COVERED / RECORDED)', () => {
    const r = run(['--assurance', 'RECEIPT_CRYPTO']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /COVERED \/ RECORDED/);
  });

  it('--assurance RECEIPT_CRYPTO in live mode exits 3 — NOT_RUN, no recorded fallback', () => {
    const r = run(['--evidence', 'live', '--assurance', 'RECEIPT_CRYPTO']);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stderr, /NOT RUN \/ NOT_RUN/);
    assert.match(r.stderr, /does not fall back/);
  });

  it('exit 3 is distinct from exit 1 — unproved is not disproved', () => {
    // Same property, same reason it must not depend on any profile being PARTIAL today.
    // A PRIVATE COPY. Removing the negative pole from the SHARED fixture — even with a rename
    // put back in a `finally` — is a mutation every concurrent reader can see, and it is one of
    // the three that made this suite fail about once in four runs.
    const { dir: capture, cleanup } = withCapture((d) => {
      require('node:fs').rmSync(require('node:path').join(d, 'negative-transcript.json'));
    });
    let unproved;
    try { unproved = run(['--assurance', 'END_TO_END', '--dir', capture]).status; } finally { cleanup(); }
    const failingRun = run(['--subject', 'branch-on-decision']).status;
    assert.notEqual(unproved, 0);
    assert.equal(failingRun, 1);
    assert.notEqual(unproved, failingRun, 'unproved and disproved must not share an exit code');
  });

  it('an unknown profile id exits 2 rather than being treated as empty', () => {
    const r = run(['--assurance', 'NOT_A_PROFILE']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown assurance profile/);
  });

  it('--profiles is a REPORT and exits 0 — the report property, not today\'s coverage', () => {
    // It used to assert /PARTIAL/ and 6/7, which pinned the state of the table rather than the
    // property being tested: --profiles REPORTS and does not gate. Now that every profile is
    // COVERED the old assertions could only be satisfied by keeping something un-covered, which is
    // the tail wagging the dog. What is asserted is the contract of the flag.
    const r = run(['--profiles']);
    assert.equal(r.status, 0, 'a report must not gate');
    assert.match(r.stdout, /END_TO_END/);
    // No fixed number: the report property is what is tested, and pinning 7/7 (or 6/7) would make
    // this fail every time coverage legitimately moves — which is how a test starts arguing for a
    // number instead of a behaviour.
    assert.match(r.stdout, /PROFILE COVERAGE \d\/7/);
    assert.match(r.stdout, /RECORDED/);
    // Both axes must still be printed separately — conflating them is the thing this table exists
    // to prevent, and that stays true at 7/7.
    assert.match(r.stdout, /two axes: coverage × evidence_tier/);
    assert.match(r.stdout, /COVERED\s+LIVE/);
    assert.match(r.stdout, /COVERED\s+RECORDED/);
  });

  it('--profiles --json emits parseable JSON with all seven profiles', () => {
    const r = run(['--profiles', '--json']);
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.profiles.length, 7);
    assert.equal(j.profiles.filter((p) => p.green).length, j.summary.covered);
  });
});

describe('the README shows the empty profiles, not only the passing ones', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  it('every profile id appears in the README table', () => {
    for (const id of AP.PROFILE_IDS) {
      assert.ok(readme.includes(`\`${id}\``), `${id} missing from the README`);
    }
  });

  it('the README states each profile status, empty ones included', () => {
    for (const r of AP.buildProfileReport()) {
      const row = readme.split('\n').find((l) => l.includes(`\`${r.id}\``) && l.startsWith('|'));
      assert.ok(row, `${r.id} must have a table row`);
      if (r.coverage === AP.COVERAGE.COVERED) {
        assert.match(row, /COVERED/);
        if (r.evidence_tier === AP.EVIDENCE_TIER.RECORDED) assert.match(row, /RECORDED/);
        if (r.evidence_tier === AP.EVIDENCE_TIER.LIVE) assert.match(row, /LIVE/);
      } else {
        assert.match(row, /NOT COVERED|NOT RUN|PARTIAL/);
      }
    }
  });

  it('the README rejects 0/0 in writing, so the decision is not just in code', () => {
    assert.match(readme, /`0\/0` is rejected as a rendering/);
    assert.match(readme, /same\s*\n?\*?shape\*? as a pass|\*same\*\n?shape/);
  });

  it('THE CEILING IS UNCHANGED and still matches the fixture', () => {
    const fixture = require('../fixtures/adversarial.v1.json');
    assert.match(readme, /ONE NAMED ATTACK SHAPE/);
    assert.ok(fixture.honesty.includes('ONE NAMED ATTACK SHAPE'));
  });

  it('the README names the unplaced vector rather than quietly dropping it', () => {
    assert.match(readme, /ADV-6/);
    assert.match(readme, /fits none of the seven|fits none/);
  });
});
