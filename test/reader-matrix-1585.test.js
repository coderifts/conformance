'use strict';
/**
 * 1585 — THE VERIFIER MATRIX. One vector set, four readers, one pinned table.
 *
 * WHY THIS FILE EXISTS, and it is not "more coverage":
 *
 * Two independent measurements of @coderifts/sdk's readDecision reached OPPOSITE verdicts. One
 * called it fail-closed, one called it fail-open. Both were right. One had fed it a WRAPPED body
 * ({decision_result:{...}}), the other a BARE one ({decision:'ALLOW'}). The wrapped arm was
 * already fail-closed; the bare arm mapped the governance label to permission. Neither
 * measurement had run the other's shape, so neither could see the split.
 *
 * A point measurement of one reader on one shape cannot settle a question about four readers
 * across two shapes. That is what this matrix is for: the SAME ten vectors through EVERY reader,
 * with the whole table pinned, so a divergence shows up as a table diff instead of as two
 * confident people disagreeing.
 *
 * WHAT THE COLUMNS ARE
 *   sdk        @coderifts/sdk       readDecision   — the agent-facing reader
 *   guard      @coderifts/agent-guard readDecision — the runtime reader
 *   gate       @coderifts/agent-guard gateDecision — the merge gate
 *   python     coderifts (PyPI)     read_decision  — the strictest reader; no legacy arm at all
 *
 * THE THREE READERS DISAGREE BY DESIGN ON TWO CELLS. That is recorded, not smoothed:
 *
 *   V01/V06 (execution_action PRESENT but not in the closed set)
 *     guard returns the RAW arrived string plus reason EXECUTION_ACTION_UNRECOGNISED, on purpose,
 *     so the arrived value survives for reconciliation. sdk and python return STOP. A guard caller
 *     that branches on `executionAction !== 'STOP'` proceeds on the raw value — which is why the
 *     guard documents that the caller MUST read `reason`.
 *
 *   V04 (bare body, explicit decision_spec_version '1.0', no action)
 *     sdk and guard allow the legacy decision->action map here. python has no legacy arm and
 *     returns STOP. Python is stricter than the contract, not in violation of it.
 *
 * WHAT THE `gate` COLUMN DOES NOT PROVE. It is BLOCKED on all ten vectors, but it refuses at
 * INPUT COMPLETENESS (no PR head sha, no bound head sha) — it never reaches the action at all.
 * Read this column as "no vector in this matrix can make the merge gate allow", which is worth
 * pinning, and NOT as "the gate evaluated these actions and refused them". It did not.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const { readDecision: sdkRead } = require('@coderifts/sdk');
const guard = require('@coderifts/agent-guard');

/** bare = the response body itself; wrapped = the body inside a decision_result envelope. */
const VECTORS = [
  { id: 'V01', shape: 'bare',    name: 'unknown action',       body: { decision: 'ALLOW', execution_action: 'DEFINITELY_GO' } },
  { id: 'V02', shape: 'bare',    name: 'missing action',       body: { decision: 'ALLOW' } },
  { id: 'V03', shape: 'bare',    name: 'CONTINUE control',     body: { decision: 'ALLOW', execution_action: 'CONTINUE' } },
  { id: 'V04', shape: 'bare',    name: 'spec 1.0, no action',  body: { decision: 'ALLOW', decision_spec_version: '1.0' } },
  { id: 'V05', shape: 'bare',    name: 'spec 2.0, no action',  body: { decision: 'ALLOW', decision_spec_version: '2.0' } },
  { id: 'V06', shape: 'wrapped', name: 'unknown action',       body: { decision_result: { decision: 'ALLOW', execution_action: 'DEFINITELY_GO' } } },
  { id: 'V07', shape: 'wrapped', name: 'missing action',       body: { decision_result: { decision: 'ALLOW' } } },
  { id: 'V08', shape: 'wrapped', name: 'CONTINUE control',     body: { decision_result: { decision: 'ALLOW', execution_action: 'CONTINUE' } } },
  { id: 'V09', shape: 'wrapped', name: 'spec 1.0, no action',  body: { decision_result: { decision: 'ALLOW' }, decision_spec_version: '1.0' } },
  { id: 'V10', shape: 'wrapped', name: 'spec 2.0, no action',  body: { decision_result: { decision: 'ALLOW' }, decision_spec_version: '2.0' } },
];

const STOP = 'STOP/UNREADABLE_DECISION';
const RAW = 'DEFINITELY_GO/EXECUTION_ACTION_UNRECOGNISED';
const GATE_BLOCKED = 'BLOCKED/inputs_incomplete';

/**
 * THE PINNED TABLE. Changing a cell here is a contract change and must be argued for in the
 * commit message, not adjusted until the suite goes green.
 */
const EXPECTED = {
  V01: { sdk: STOP,       guard: RAW,  gate: GATE_BLOCKED, python: STOP },
  V02: { sdk: STOP,       guard: STOP, gate: GATE_BLOCKED, python: STOP },
  V03: { sdk: 'CONTINUE', guard: 'CONTINUE', gate: GATE_BLOCKED, python: 'CONTINUE' },
  V04: { sdk: 'CONTINUE', guard: 'CONTINUE', gate: GATE_BLOCKED, python: STOP },
  V05: { sdk: STOP,       guard: STOP, gate: GATE_BLOCKED, python: STOP },
  V06: { sdk: STOP,       guard: RAW,  gate: GATE_BLOCKED, python: STOP },
  V07: { sdk: STOP,       guard: STOP, gate: GATE_BLOCKED, python: STOP },
  V08: { sdk: 'CONTINUE', guard: 'CONTINUE', gate: GATE_BLOCKED, python: 'CONTINUE' },
  V09: { sdk: STOP,       guard: STOP, gate: GATE_BLOCKED, python: STOP },
  V10: { sdk: STOP,       guard: STOP, gate: GATE_BLOCKED, python: STOP },
};

const fmt = (r) => String(r.executionAction) + (r.reason ? '/' + r.reason : '');

function readAllPython() {
  // One subprocess for all ten vectors, not ten. Deliberately NOT wrapped in a try that turns a
  // missing interpreter into a skip: a reader that cannot be reached is an unmeasured reader, and
  // this matrix exists precisely because an unmeasured reader is how the 1565 split survived.
  const src = `
import json, sys
from coderifts.decision import read_decision
out = {}
for v in json.load(sys.stdin):
    r = read_decision(v["body"])
    out[v["id"]] = r.execution_action + ("/" + r.reason if r.reason else "")
print(json.dumps(out))
`;
  const stdout = execFileSync('python3', ['-c', src], {
    input: JSON.stringify(VECTORS), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

test('1585 — ten vectors, four readers, table pinned', () => {
  const python = readAllPython();
  const actual = {};
  for (const v of VECTORS) {
    const gd = guard.gateDecision(v.body);
    actual[v.id] = {
      sdk: fmt(sdkRead(v.body)),
      guard: fmt(guard.readDecision(v.body)),
      gate: (gd.merge_allowed ? 'ALLOWED' : 'BLOCKED') + '/' + gd.reason,
      python: python[v.id],
    };
  }
  // Whole-table compare: a single failure prints every cell, so a reader that drifts is located
  // in one read rather than bisected one assertion at a time.
  assert.deepEqual(actual, EXPECTED);
});

test('1585 — no vector in this set grants permission from the decision label alone', () => {
  // The 1565 invariant, stated so it survives a future table edit: a body whose ONLY permission
  // evidence is decision:'ALLOW' must not read as CONTINUE anywhere, unless it declares spec 1.0.
  for (const v of VECTORS) {
    const declaresLegacy = v.body.decision_spec_version === '1.0' && !v.body.decision_result;
    const hasExplicitAction =
      v.body.execution_action === 'CONTINUE' ||
      (v.body.decision_result && v.body.decision_result.execution_action === 'CONTINUE');
    if (declaresLegacy || hasExplicitAction) continue;
    assert.equal(EXPECTED[v.id].sdk, STOP, `${v.id} sdk`);
    assert.equal(EXPECTED[v.id].python, STOP, `${v.id} python`);
    assert.notEqual(EXPECTED[v.id].guard, 'CONTINUE', `${v.id} guard`);
  }
});

test('1585 — the guard returns the arrived value verbatim on an unrecognised action', () => {
  // Pins the deliberate divergence itself, so "make the readers agree" cannot be done quietly by
  // normalising the guard to STOP. That would erase the only evidence a reconciliation has.
  const r = guard.readDecision(VECTORS.find((v) => v.id === 'V01').body);
  assert.equal(r.reason, 'EXECUTION_ACTION_UNRECOGNISED');
  assert.equal(r.executionAction, 'DEFINITELY_GO');
  assert.notEqual(r.executionAction, 'STOP');
});
