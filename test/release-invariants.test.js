'use strict';

/**
 * RELEASE INVARIANTS — the package must not assert two different things at once.
 *
 * ── WHAT 0.8.5 SHIPPED, MEASURED ────────────────────────────────────────────────────────────
 *
 *   the measure           END_TO_END COVERED, 7/7
 *   the same profile row  gaps: [no shared run_id, POINT 8 MODELLED, …]
 *   does_not_prove        "…END_TO_END is PARTIAL and 7/7 is not an operational claim"
 *   README.md             "END_TO_END | PARTIAL" and "PROFILE COVERAGE 6/7"
 *
 * Four statements, one command, mutually exclusive. Nothing was forged and every sentence had
 * been true when it was written; each described the capture it was authored against, and the
 * capture moved. A reader cannot tell which one to believe, so the package's own word is worth
 * less than any single one of them.
 *
 * ── WHY THESE ARE SEMANTIC, NOT SNAPSHOTS ───────────────────────────────────────────────────
 *
 * A snapshot test pins "END_TO_END is COVERED" and passes for as long as nobody edits the
 * snapshot. It cannot notice that the README disagrees, because the README is not in it. These
 * assert RELATIONSHIPS between the outputs — grade against gaps, grade against prose, counts
 * against documentation — so the next capture that moves the grade drags every statement with it
 * or fails here.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');

const cli = (...args) => spawnSync(process.execPath,
  [path.join(ROOT, 'bin', 'coderifts-conformance.js'), ...args], { encoding: 'utf8' });

/** Every profile row the library reports, however it is spelled today. */
function profileRows() {
  const { buildProfileReport } = require('../lib/assurance-profiles.js');
  const report = buildProfileReport();
  const rows = Array.isArray(report) ? report : (report.profiles || []);
  // NOT a silent empty. A file that could not load the profiles would otherwise report every
  // invariant as satisfied — vacuously, over nothing.
  assert.ok(rows.length > 0, 'the profile set did not load — this file cannot check anything');
  return rows;
}

describe('a COVERED profile carries no gaps of its own', () => {
  for (const row of profileRows()) {
    it(`${row.id}: coverage and gaps agree`, () => {
      const gaps = row.gaps || [];
      if (row.coverage === 'COVERED') {
        assert.deepEqual(gaps, [],
          `${row.id} is COVERED and names ${gaps.length} gap(s):\n${gaps.join('\n')}`);
      } else {
        // The converse matters just as much: a PARTIAL with no reason is a grade nobody can act on.
        assert.ok(gaps.length > 0, `${row.id} is ${row.coverage} and names no gap`);
      }
    });
  }

  it('a neighbouring capture\'s gaps are NAMED as such, never merged into the grade', () => {
    // They are still printed. What changed is that they no longer live in the field a reader
    // reads as "reasons this profile is not covered".
    const e2e = profileRows().find((r) => r.id === 'END_TO_END');
    for (const g of e2e.adjacent_gaps || []) {
      assert.match(g, /^\[.+\]/, 'an adjacent gap must name whose capture it is about');
      assert.ok(!(e2e.gaps || []).includes(g), 'an adjacent gap leaked into the profile\'s own gaps');
    }
  });
});

describe('the prose agrees with the grade', () => {
  it('a COVERED END_TO_END does not carry a does_not_prove saying it is PARTIAL', () => {
    const m = measureContractE2E();
    if (m.coverage !== 'COVERED') return;
    for (const line of m.does_not_prove || []) {
      assert.doesNotMatch(line, /END_TO_END is PARTIAL/i,
        `COVERED, and a limit says it is PARTIAL:\n  ${line}`);
      assert.doesNotMatch(line, /7\/7 is not an operational claim/i,
        `COVERED, and a limit says 7\\/7 is not operational:\n  ${line}`);
    }
  });

  it('does_not_prove describes THIS capture — the root line follows the root', () => {
    // Generated, not recited. The old constant claimed a cross-run token "is accepted today" for
    // a capture that binds every token to one run.
    const m = measureContractE2E();
    const artifact = JSON.parse(fs.readFileSync(
      path.join(m.dir || path.join(ROOT, 'fixtures', 'recorded', 'end-to-end'), 'transcript.json'), 'utf8'));
    const rooted = !!artifact.evidence_root;
    const lines = (m.does_not_prove || []).join('\n');
    if (rooted) {
      assert.doesNotMatch(lines, /carries no cr\.evidence\.root\.v1/,
        'the capture has a root and the limits say it has none');
    } else {
      assert.match(lines, /carries no cr\.evidence\.root\.v1/,
        'the capture has no root and the limits do not say so');
    }
  });

  it('every PASSING check explains why it passed — no inverted sentences', () => {
    // The shape that shipped, in the producer's own artifact:
    //   { id: 'executor_attested', ok: true,
    //     detail: 'no executor attestation accompanies this transition' }
    const m = measureContractE2E();
    const dir = m.dir || path.join(ROOT, 'fixtures', 'recorded', 'end-to-end');
    const artifact = JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'));
    const checks = (artifact.target_state_transition || {}).checks || [];
    for (const c of checks) {
      if (c.ok !== true) continue;
      assert.doesNotMatch(String(c.detail), /^no \w|nothing signed|does not |is not /i,
        `check "${c.id}" passed with a failure sentence: ${c.detail}`);
    }
  });
});

describe('the documentation states the same coverage the tool prints', () => {
  const printed = cli('--profiles').stdout;
  const m = printed.match(/PROFILE COVERAGE (\d+)\/(\d+)/);

  it('the CLI prints a coverage fraction at all', () => {
    assert.ok(m, `no coverage line in --profiles output:\n${printed.slice(0, 400)}`);
  });

  it('README does not state a DIFFERENT fraction than the CLI', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const [, covered, total] = m;
    for (const found of readme.matchAll(/PROFILE COVERAGE (\d+)\/(\d+)/g)) {
      assert.equal(`${found[1]}/${found[2]}`, `${covered}/${total}`,
        `README says PROFILE COVERAGE ${found[1]}/${found[2]}, the CLI prints ${covered}/${total}`);
    }
  });

  it('README does not grade END_TO_END differently than the measure does', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const row = readme.split('\n').find((l) => l.includes('`END_TO_END`') && l.startsWith('|'));
    if (!row) return;
    const graded = measureContractE2E().coverage;
    const other = ['COVERED', 'PARTIAL', 'NOT_COVERED'].filter((g) => g !== graded);
    for (const g of other) {
      assert.ok(!row.includes(`**${g}**`),
        `README grades END_TO_END ${g}; the measure grades it ${graded}`);
    }
    assert.ok(row.includes(`**${graded}**`),
      `README does not state END_TO_END as ${graded}`);
  });
});

describe('the does_not_prove text describes THIS capture\'s target kind', () => {
  it('a local bare-Git capture names no provider as a party', () => {
    // MEASURED: the static text said "the provider did what the readback says" and "the provider's
    // copy of the contract" for a capture with no provider anywhere in it. That is not merely
    // stale — it tells a reader there IS a provider whose behaviour is unproven, which is a
    // stronger and different claim than "there is no provider".
    const m = measureContractE2E();
    const artifact = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'fixtures', 'recorded', 'end-to-end', 'transcript.json'), 'utf8'));
    const tst = artifact.target_state_transition || {};
    if (tst.target_kind !== 'git_bare_ref' || tst.provider_witness !== 'NOT_APPLICABLE') return;
    const text = (m.does_not_prove || []).join('\n');
    for (const stale of [/the provider did what the readback says/i, /provider's copy of the contract/i,
      /contract-publish chain/i]) {
      assert.doesNotMatch(text, stale,
        `a local bare-Git capture carries provider-domain wording: ${stale}`);
    }
    // …and it says what it IS, from the fields rather than from prose.
    assert.ok(text.includes(tst.target_kind), 'the limits do not name the target kind');
    assert.ok(text.includes(tst.provider_witness), 'the limits do not name provider_witness');
    assert.match(text, /git\.ref\.update chain/);
  });

  it('the wording is GENERATED — a provider-shaped capture still gets provider wording', () => {
    // Otherwise this would be a find-and-replace that breaks the moment a PATH-B capture is
    // graded again, and nobody would notice until a reader was told there is no provider in a
    // capture that has one.
    const { e2eDoesNotProve } = require('../lib/recorded-contract-e2e.js');
    const provider = e2eDoesNotProve({
      rootPresent: true,
      attestationCarried: true,
      transition: { target_kind: 'provider_merge', provider_witness: 'PRESENT' },
    }).join('\n');
    assert.match(provider, /provider's copy of the contract/);
    assert.doesNotMatch(provider, /LOCAL bare-Git target/);
  });
});
