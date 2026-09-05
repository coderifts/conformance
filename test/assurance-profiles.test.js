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
    const forged = AP.buildProfileReport().map((r) => (
      r.coverage !== AP.COVERAGE.COVERED ? { ...r, green: true } : r));
    assert.throws(() => AP.assertNoGreenEmpty(forged), /marked green — refusing to render/);
    // and the renderers call the guard, so neither format can emit it
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

describe('the CLI gates on a single profile with a distinct exit code', () => {
  it('--assurance on a COVERED profile exits 0', () => {
    const r = run(['--assurance', 'DECISION_LOGIC']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  it('--assurance on END_TO_END exits 3 — PARTIAL is not COVERED', () => {
    const r = run(['--assurance', 'END_TO_END']);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /PARTIAL \/ RECORDED — this suite does not prove this claim/);
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
    const notCovered = run(['--assurance', 'END_TO_END']).status;
    const failingRun = run(['--subject', 'branch-on-decision']).status;
    assert.equal(notCovered, 3);
    assert.equal(failingRun, 1);
    assert.notEqual(notCovered, failingRun);
  });

  it('an unknown profile id exits 2 rather than being treated as empty', () => {
    const r = run(['--assurance', 'NOT_A_PROFILE']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown assurance profile/);
  });

  it('--profiles is a REPORT and exits 0 even with a PARTIAL profile', () => {
    const r = run(['--profiles']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /END_TO_END/);
    assert.match(r.stdout, /PARTIAL/);
    assert.match(r.stdout, /PROFILE COVERAGE 6\/7/);
    assert.match(r.stdout, /RECORDED/);
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
