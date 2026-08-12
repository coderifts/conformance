/**
 * Subject wired to @coderifts/sdk readDecision (installed dep in this repo).
 * Reads execution_action via the SDK helper, then applies the normative decide mapping.
 * tool_selection cases are not implemented by the SDK — delegated to reference (report as partial).
 */
'use strict';

const { readDecision } = require('@coderifts/sdk');
const { decide: normativeDecide, toolSelection } = require('./reference');

const CLOSED = new Set([
  'CONTINUE',
  'CONTINUE_WITH_MONITORING',
  'REQUEST_APPROVAL',
  'STOP',
]);

function sdkReadDecisionSubject(c) {
  if (c.kind === 'tool_selection') {
    // SDK has no tool-selection API — not claimed as SDK coverage for those cases.
    return toolSelection(c.input);
  }
  if (c.kind !== 'decide') throw new Error(`unknown kind ${c.kind}`);

  // If the wire carries an explicit execution_action outside the closed set, fail closed.
  // readDecision alone would fall through to decision→map and treat unrecognised as absent —
  // that is not permission under well-known unrecognised_execution_action.
  const rawEa = c.input.response && c.input.response.execution_action;
  if (rawEa != null && rawEa !== '' && !CLOSED.has(rawEa)) {
    return { outcome: 'halt' };
  }

  const rd = readDecision(c.input.response);
  // Re-shape as a response that carries only what the SDK resolved (proves envelope-first path).
  const response = {
    decision: rd.decision,
    execution_action: rd.executionAction,
  };
  return normativeDecide({ response, host: c.input.host });
}

module.exports = { sdkReadDecisionSubject };
