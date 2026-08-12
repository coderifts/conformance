/**
 * Subject wired to @coderifts/agent-guard pure helpers (no network).
 *
 * Runs only decide cases. Uses readDecision + evaluateEnvelope + monitoringSinkWired
 * (same MONITOR gate shape as guard.js).
 *
 * Deliberate liveness strictness: safe_for_agent === false fails closed even when
 * execution_action would proceed under pure branch_on. Declared as
 * `safe_for_agent_false` with demonstration via AA-BRANCH-NOT-SAFE-FOR-AGENT
 * (present) + AA-BRANCH-CONTINUE (absent).
 */
'use strict';

const {
  readDecision,
  evaluateEnvelope,
} = require('@coderifts/agent-guard');

const CLOSED = new Set([
  'CONTINUE',
  'CONTINUE_WITH_MONITORING',
  'REQUEST_APPROVAL',
  'STOP',
]);

/** Floor would treat these as executable (liveness) under pure branch_on. */
function floorExecutableAction(ea, host) {
  if (ea === 'CONTINUE') return true;
  if (ea === 'CONTINUE_WITH_MONITORING' && host && host.monitoringSinkWired === true) return true;
  return false;
}

/**
 * Present-but-unrecognised execution_action is not missing.
 * Check the raw response field before trusting any readDecision ladder that might
 * fall through to the decision map (the bug class closed in agent-guard).
 */
function rawPresentAction(response) {
  if (!response || typeof response !== 'object') return { kind: 'missing' };
  if (Object.prototype.hasOwnProperty.call(response, 'execution_action')) {
    const v = response.execution_action;
    if (v === undefined || v === null || v === '') return { kind: 'missing' };
    if (typeof v === 'string' && CLOSED.has(v)) return { kind: 'known', value: v };
    return { kind: 'unrecognised', value: v };
  }
  return { kind: 'missing' };
}

function agentGuardDecideSubject(c) {
  if (c.kind === 'tool_selection') {
    // agent-guard does not select MCP tools from situations — not covered.
    throw new Error('agent-guard subject does not implement tool_selection');
  }
  if (c.kind !== 'decide') throw new Error(`unknown kind ${c.kind}`);

  const response = c.input.response;
  const host = c.input.host || {};

  // SAFETY floor: present unrecognised action → halt (never invent permission from decision).
  const raw = rawPresentAction(response);
  if (raw.kind === 'unrecognised') {
    return { outcome: 'halt' };
  }

  const rd = readDecision(response);
  const ea = rd.executionAction;

  // Package-side reason (when agent-guard readDecision is fixed) or non-closed result.
  if (rd.reason === 'EXECUTION_ACTION_UNRECOGNISED') {
    return { outcome: 'halt' };
  }
  if (ea !== 'CONTINUE' && ea !== 'CONTINUE_WITH_MONITORING'
      && ea !== 'REQUEST_APPROVAL' && ea !== 'STOP') {
    return { outcome: 'halt' };
  }

  const envelope = {
    decision: response.decision,
    execution_action: response.execution_action,
    safe_for_agent: response.safe_for_agent,
    analysis_complete: true,
  };

  const gate = evaluateEnvelope(response, envelope, ea, null);

  let outcome;
  if (gate.verdict === 'fail-closed') {
    outcome = 'halt';
  } else if (gate.verdict === 'block-strict') {
    outcome = gate.decision === 'REQUIRE_APPROVAL' ? 'request_approval' : 'halt';
  } else if (gate.kind === 'MONITOR' || ea === 'CONTINUE_WITH_MONITORING') {
    outcome = host.monitoringSinkWired === true
      ? 'proceed_with_monitoring'
      : 'halt';
  } else if (ea === 'REQUEST_APPROVAL') {
    outcome = 'request_approval';
  } else if (ea === 'STOP') {
    outcome = 'halt';
  } else if (ea === 'CONTINUE' || gate.kind === 'ALLOW') {
    outcome = 'proceed';
  } else {
    outcome = 'halt';
  }

  const result = { outcome };

  // Declare liveness strictness only when we stop-direction relative to floor
  // because safe_for_agent is false on an otherwise executable action.
  if (
    outcome === 'halt'
    && response.safe_for_agent === false
    && floorExecutableAction(ea, host)
  ) {
    result.declared_strictnesses = ['safe_for_agent_false'];
  }

  return result;
}

module.exports = { agentGuardDecideSubject };
