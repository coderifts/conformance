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
const { referenceSubject } = require('../subjects/reference');
const { branchOnDecisionSubject } = require('../subjects/branch-on-decision');
const { sdkReadDecisionSubject } = require('../subjects/sdk-read-decision');
const { agentGuardDecideSubject } = require('../subjects/agent-guard-decide');
const { runAndPrint } = require('../lib/model-acceptance');
const {
  STATUS, PROFILE_IDS, buildProfileReport, renderProfileTable, renderProfileJson,
} = require('../lib/assurance-profiles');

const SUBJECTS = {
  reference: referenceSubject,
  'branch-on-decision': branchOnDecisionSubject,
  sdk: sdkReadDecisionSubject,
  'agent-guard': agentGuardDecideSubject,
  'model-acceptance': Symbol.for('coderifts.conformance.model-acceptance'),
};

function parseArgs(argv) {
  let subject = 'reference';
  let profile = 'normative';
  let json = false;
  let profilesReport = false;
  let assurance = null;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--subject') subject = argv[++i];
    else if (argv[i] === '--profile') profile = argv[++i];
    else if (argv[i] === '--profiles') profilesReport = true;
    else if (argv[i] === '--assurance') assurance = argv[++i];
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: coderifts-conformance [--subject <name>] [--profile <name>]\n'
        + `Subjects: ${Object.keys(SUBJECTS).join(', ')}\n`
        + 'Profiles: normative (default), enforcement_consistent, all\n'
        + '--profiles            report the seven ASSURANCE profiles and what each one proves\n'
        + '--assurance <ID>      exit non-zero unless that assurance profile is COVERED\n'
        + `                      (${PROFILE_IDS.join(', ')})\n`
        + 'model-acceptance: canned 4-provider tool-use through bind/execute helpers (offline).\n'
        + '  Proves host-wired helpers are consistent; not that models spontaneously preflight.\n'
        + 'Exit 0 iff all selected cases pass. Offline; no API key.\n',
      );
      process.exit(0);
    }
  }
  return { subject, profile, json, profilesReport, assurance };
}

async function main() {
  const {
    subject: subjectName, profile, json, profilesReport, assurance,
  } = parseArgs(process.argv);

  // ── assurance-profile reporting ──
  // Exits 0 because it is a REPORT, not a run: it says truthfully that four profiles have no
  // vectors. Exiting non-zero would make `--profiles` unusable as documentation.
  if (profilesReport) {
    const rows = buildProfileReport();
    process.stdout.write(json
      ? `${JSON.stringify(renderProfileJson(rows), null, 2)}\n`
      : `${renderProfileTable(rows)}\n`);
    process.exit(0);
  }

  // ── gating on ONE assurance profile ──
  // A CI job pointed at an empty profile must not go green forever. Selecting zero vectors and
  // exiting 0 is exactly the "0/0 reads like a pass" failure, so anything but COVERED exits 3 —
  // distinct from 1 (a vector failed), because "nothing proved this" is not "this was disproved".
  if (assurance !== null) {
    const rows = buildProfileReport();
    const row = rows.find((r) => r.id === assurance);
    if (!row) {
      process.stderr.write(`unknown assurance profile ${assurance}; known: ${PROFILE_IDS.join(', ')}\n`);
      process.exit(2);
    }
    if (json) process.stdout.write(`${JSON.stringify(renderProfileJson([row]), null, 2)}\n`);
    if (row.status === STATUS.COVERED) {
      if (!json) process.stdout.write(`${row.id}: COVERED — ${row.runnable} vector(s) run\n`);
      process.exit(0);
    }
    process.stderr.write(
      `${row.id}: ${row.status === STATUS.NOT_RUN ? 'NOT RUN' : 'NOT COVERED'} — this suite does `
      + 'not prove this claim.\n'
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

  const doc = loadCaseFile();
  let cases = filterByProfile(doc, profile);
  // agent-guard subject cannot run tool_selection
  if (subjectName === 'agent-guard') {
    cases = cases.filter((c) => c.kind === 'decide');
  }

  const scored = scoreSubject(cases, subject);
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
