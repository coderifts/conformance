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
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--subject') subject = argv[++i];
    else if (argv[i] === '--profile') profile = argv[++i];
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: coderifts-conformance [--subject <name>] [--profile <name>]\n'
        + `Subjects: ${Object.keys(SUBJECTS).join(', ')}\n`
        + 'Profiles: normative (default), enforcement_consistent, all\n'
        + 'model-acceptance: canned 4-provider tool-use through bind/execute helpers (offline).\n'
        + '  Proves host-wired helpers are consistent; not that models spontaneously preflight.\n'
        + 'Exit 0 iff all selected cases pass. Offline; no API key.\n',
      );
      process.exit(0);
    }
  }
  return { subject, profile, json };
}

async function main() {
  const { subject: subjectName, profile, json } = parseArgs(process.argv);
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
