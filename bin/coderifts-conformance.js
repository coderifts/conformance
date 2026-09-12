#!/usr/bin/env node
/**
 * @coderifts/conformance — offline adapter-acceptance runner (public CLI).
 *
 * Usage:
 *   npx @coderifts/conformance --subject reference
 *   npx @coderifts/conformance --subject branch-on-decision
 *   npx @coderifts/conformance --subject sdk
 *   npx @coderifts/conformance --subject agent-guard --profile enforcement_consistent
 *   npx @coderifts/conformance --subject model-acceptance
 *   npx @coderifts/conformance --subject data-plane        # runs the capability-demo atomic chain
 *   node bin/coderifts-conformance.js --subject reference
 *
 * Exit 0 iff all selected cases pass. No network. No API key.
 * Does NOT assert app-private source anchors (those stay in coderifts-app CI).
 * model-acceptance is a separate offline harness (not cases.v1.json): canned
 * provider tool-use through bind*GuardOutcome / execute*ToolCall. Host-wired
 * helpers, not "the model spontaneously preflights".
 */
'use strict';

const { loadCaseFile, filterByProfile } = require('../lib/load-cases');
const { scoreSubject } = require('../lib/score');
const { runAndPrint } = require('../lib/model-acceptance');
// data-plane stays a top-level require: it pulls only node: builtins, so it costs nothing to
// load, and ROW is needed by printDataPlane below. The four lazy entries are the ones that
// reach for an external package.
const { runDataPlane, ROW } = require('../subjects/data-plane');
const {
  COVERAGE, PROFILE_IDS, DEFAULT_EVIDENCE,
  buildProfileReport, renderProfileTable, renderProfileJson,
} = require('../lib/assurance-profiles');

/**
 * 1567 — SUBJECTS MAPS TO A LOADER, NOT TO A LOADED FUNCTION.
 *
 * These four used to be top-level requires. `subjects/sdk-read-decision.js` requires
 * `@coderifts/sdk` and `subjects/agent-guard-decide.js` requires `@coderifts/agent-guard`, so
 * loading the table loaded both packages — whichever subject the caller had asked for.
 *
 * MEASURED on the published 0.8.10, from the extracted tarball with no node_modules beside it:
 *   node bin/coderifts-conformance.js --subject reference
 *   -> Error: Cannot find module '@coderifts/sdk'
 *        Require stack: .../subjects/sdk-read-decision.js
 *
 * `reference` is documented in README.md as `Deps: none`. It could not run without the
 * dependencies of two subjects it does not use. Every subject failed the same way, including
 * the `--assurance END_TO_END` command VERIFY.md hands to a stranger.
 *
 * Resolving at selection keeps a dependency-free subject dependency-free. A missing dependency
 * now surfaces when you ask for the subject that needs it, naming that subject.
 */
const SUBJECTS = {
  reference: () => require('../subjects/reference').referenceSubject,
  'branch-on-decision': () => require('../subjects/branch-on-decision').branchOnDecisionSubject,
  sdk: () => require('../subjects/sdk-read-decision').sdkReadDecisionSubject,
  'agent-guard': () => require('../subjects/agent-guard-decide').agentGuardDecideSubject,
  'model-acceptance': Symbol.for('coderifts.conformance.model-acceptance'),
  // Not a `(case) => outcome` function: it EXECUTES the capability-demo atomic chain. Dispatched
  // separately below, like model-acceptance, because cases.v1.json is vendored byte-identical from
  // the app (gated there by conformance-cases-vendored-sync.test.js) — rows for a new kind cannot
  // be added here, and a subject that answered `decide` cases from a data-plane run would be
  // answering questions it did not ask.
  'data-plane': Symbol.for('coderifts.conformance.data-plane'),
};

/**
 * Report the data-plane rows. Exit 0 when nothing FAILED — including when everything skipped,
 * because a skip that is printed with its reason is a truthful report, and exiting non-zero would
 * make the keyless npx path look broken. What must never happen is a skip reading as a pass, so
 * the summary states the covered count and, when it is zero, says so in those words.
 */
function printDataPlane(out, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else {
    for (const r of out.rows) {
      const profile = r.profile || '(no profile)';
      process.stdout.write(`${r.status.padEnd(15)} ${r.id}  → ${profile}${r.partial ? ' (PARTIAL at best)' : ''}\n`);
      for (const e of r.evidence) process.stdout.write(`                  evidence: ${e}\n`);
      if (r.status === ROW.NOT_ADMISSIBLE) process.stdout.write(`                  not admissible: ${r.why}\n`);
      if (r.ceiling) process.stdout.write(`                  does not prove: ${r.ceiling}\n`);
    }
    if (out.chain) {
      const sum = out.chain.summary;
      process.stdout.write(`\nchain: exit ${out.chain.exit}${sum ? `, ${sum.asserted}/${sum.total} hops — ${sum.note}` : ''}\n`);
    } else {
      process.stdout.write('\nchain: NOT RUN\n');
    }
    if (out.postgres.skip) process.stdout.write(`postgres: SKIPPED — ${out.postgres.skip}\n`);
    const covered = out.rows.filter((r) => r.status === ROW.COVERED).length;
    const failed = out.rows.filter((r) => r.status === ROW.FAILED).length;
    const entries = Object.entries(out.profiles);
    process.stdout.write(
      `\ndata-plane: ${covered} row(s) COVERED, ${failed} FAILED, `
      + `${out.rows.length - covered - failed} not counted\n`,
    );
    for (const [id, p] of entries) process.stdout.write(`  ${id}: ${p.status} (${p.rows.join(', ')})\n`);
    if (covered === 0) {
      process.stdout.write(
        '\nNOTHING WAS PROVED BY THIS RUN. The chain\'s hops are integration checks whose evidence\n'
        + 'belongs to other repositories; the rows that would prove ATOMIC_COMMIT and the database\n'
        + 'half of CREDENTIAL_BOUNDARY need a live Postgres (CODERIFTS_DATAPLANE_PG). This is a\n'
        + 'report of skips, not a pass.\n',
      );
    }
  }
  return out.rows.some((r) => r.status === ROW.FAILED) ? 1 : 0;
}

function parseArgs(argv) {
  let subject = 'reference';
  let profile = 'normative';
  let json = false;
  let profilesReport = false;
  let assurance = null;
  let evidence = DEFAULT_EVIDENCE;
  let dir = null;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--dir') dir = argv[++i];
    else if (argv[i] === '--subject') subject = argv[++i];
    else if (argv[i] === '--profile') profile = argv[++i];
    else if (argv[i] === '--profiles') profilesReport = true;
    else if (argv[i] === '--assurance') assurance = argv[++i];
    else if (argv[i] === '--evidence') evidence = argv[++i];
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: coderifts-conformance [--subject <name>] [--profile <name>] [--evidence recorded|live]\n'
        + `Subjects: ${Object.keys(SUBJECTS).join(', ')}\n`
        + 'Profiles: normative (default), enforcement_consistent, all\n'
        + '--profiles            report the seven ASSURANCE profiles (coverage × evidence_tier)\n'
        + '                      JSON counts: vectors_present = unique vectors;\n'
        + '                      vectors_positive/negative = polarity occurrences (a pair vector\n'
        + '                      counts in both). present need not equal pos+neg.\n'
        + '--assurance <ID>      exit non-zero unless that assurance profile is COVERED\n'
        + '--dir <path>          grade an EXTERNAL capture directory instead of the embedded\n'
        + '                      fixture (END_TO_END). An unreadable or incomplete directory is\n'
        + '                      refused; it never falls back to the embedded capture.\n'
        + `                      (${PROFILE_IDS.join(', ')})\n`
        + '--evidence recorded   (default) verify vendored pinned external artifacts\n'
        + '--evidence live       produce new proof on available infra; NOT_RUN without infra\n'
        + '                      (does not fall back to recorded)\n'
        + 'data-plane: EXECUTES the capability-demo atomic chain (examples/atomic-v2) and reports\n'
        + '  per-row evidence. Keyless and offline; ATOMIC_COMMIT and the database half of\n'
        + '  CREDENTIAL_BOUNDARY need CODERIFTS_DATAPLANE_PG, and are skipped-with-reason without it.\n'
        + 'model-acceptance: canned 4-provider tool-use through bind/execute helpers (offline).\n'
        + '  Proves host-wired helpers are consistent; not that models spontaneously preflight.\n'
        + 'Exit 0 iff all selected cases pass. Offline; no API key.\n',
      );
      process.exit(0);
    } else {
      // ── AN UNKNOWN ARGUMENT IS A USAGE ERROR, NOT A SHRUG ─────────────────────────────
      //
      // MEASURED: `--potato` was silently ignored and the run exited 0. So was `--dir`, for the
      // same reason — an unrecognised flag fell through the chain and the command answered a
      // question nobody asked. A typo in a reproduction command must not read as a pass.
      process.stderr.write(`unknown argument: ${argv[i]}\n`
        + 'run with --help for the accepted arguments\n');
      process.exit(2);
    }
  }
  if (dir !== null && (typeof dir !== 'string' || dir.length === 0 || dir.startsWith('--'))) {
    process.stderr.write('--dir requires a path\n');
    process.exit(2);
  }
  if (evidence !== 'recorded' && evidence !== 'live') {
    process.stderr.write(`unknown --evidence ${evidence}; known: recorded, live\n`);
    process.exit(2);
  }
  return { subject, profile, json, profilesReport, assurance, evidence, dir };
}

async function main() {
  const {
    subject: subjectName, profile, json, profilesReport, assurance, evidence, dir,
  } = parseArgs(process.argv);

  // ── assurance-profile reporting ──
  // Exits 0 because it is a REPORT, not a run. PARTIAL and NOT_COVERED rows print as words.
  if (profilesReport) {
    const rows = buildProfileReport({ evidence, dir });
    process.stdout.write(json
      ? `${JSON.stringify(renderProfileJson(rows), null, 2)}\n`
      : `${renderProfileTable(rows)}\n`);
    process.exit(0);
  }

  // ── gating on ONE assurance profile ──
  // Anything but COVERED exits 3 — PARTIAL included. COVERED+RECORDED is a pass of the
  // recorded claim; COVERED+LIVE+FAIL would still be COVERED (a found regression is a
  // different exit, from the subject run). Distinct from 1 (a vector failed).
  if (assurance !== null) {
    const rows = buildProfileReport({ evidence, dir });
    const row = rows.find((r) => r.id === assurance);
    if (!row) {
      process.stderr.write(`unknown assurance profile ${assurance}; known: ${PROFILE_IDS.join(', ')}\n`);
      process.exit(2);
    }
    if (json) process.stdout.write(`${JSON.stringify(renderProfileJson([row]), null, 2)}\n`);
    // WHICH BYTES PRODUCED THIS ANSWER — always, pass or fail. A verdict whose subject a reader
    // has to infer from whether they remembered a flag is how `--dir /nonexistent` read as COVERED
    // for a whole release: the output was true of a capture nobody had asked about.
    if (!json && row.evidence_dir) {
      const stream = row.coverage === COVERAGE.COVERED ? process.stdout : process.stderr;
      stream.write(`evidence_dir: ${row.evidence_dir}\n`);
      stream.write(`source: ${row.source}\n`);
    }
    const coverage = row.coverage || row.status;
    if (coverage === COVERAGE.COVERED) {
      if (!json) {
        process.stdout.write(
          `${row.id}: COVERED / ${row.evidence_tier} — ${row.runnable} vector(s)\n`,
        );
      }
      process.exit(0);
    }
    const label = coverage === COVERAGE.PARTIAL
      ? 'PARTIAL'
      : (row.evidence_tier === 'NOT_RUN' ? 'NOT RUN' : 'NOT COVERED');
    // THE REASON, not only the grade. MEASURED: `--dir /nonexistent` printed PARTIAL and nothing
    // else — a reader got a refusal with no way to tell a typo'd path from a genuinely failing
    // capture. The gaps are what they act on.
    process.stderr.write(
      `${row.id}: ${label} / ${row.evidence_tier} — this suite does not prove this claim.\n`
      + `  ${row.why_empty || 'no vector exists'}\n`,
    );
    process.exit(3);
  }
  const subject = SUBJECTS[subjectName];
  if (!subject) {
    process.stderr.write(`unknown subject ${subjectName}; known: ${Object.keys(SUBJECTS).join(', ')}\n`);
    process.exit(2);
  }

  if (subjectName === 'model-acceptance') {
    const code = await runAndPrint({ json });
    process.exit(code);
  }

  if (subjectName === 'data-plane') {
    process.exit(printDataPlane(await runDataPlane(), json));
  }

  const doc = loadCaseFile();
  let cases = filterByProfile(doc, profile);
  // agent-guard subject cannot run tool_selection
  if (subjectName === 'agent-guard') {
    cases = cases.filter((c) => c.kind === 'decide');
  }

  // Resolve HERE, not at table construction. model-acceptance and data-plane have already
  // exited above, so `subject` is one of the four loaders and calling it loads exactly the one
  // package this run needs.
  const scored = scoreSubject(cases, subject());
  for (const r of scored.results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    const extra = r.ok && r.excused
      ? ` (declared: ${(r.used_strictnesses || []).join(', ')})`
      : '';
    process.stdout.write(
      `${mark} ${r.id}${r.ok ? extra : ` — ${r.mismatches.join('; ')}`}\n`,
    );
  }
  process.stdout.write(
    `\n${subjectName} profile=${profile}: ${scored.passed} passed, ${scored.failed} failed (n=${cases.length})\n`
    + `${scored.summary}\n`,
  );
  process.exit(scored.failed === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}

module.exports = { main, SUBJECTS };
