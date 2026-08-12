/**
 * Reference subject — pure well-known / tool-description consumer.
 * Normative mapping from CONTRACT.md (not an adapter product).
 */
'use strict';

const CLOSED = new Set([
  'CONTINUE',
  'CONTINUE_WITH_MONITORING',
  'REQUEST_APPROVAL',
  'STOP',
]);

function decide(input) {
  const response = (input && input.response) || {};
  const host = (input && input.host) || {};
  const ea = response.execution_action;

  if (ea === 'CONTINUE') return { outcome: 'proceed' };
  if (ea === 'CONTINUE_WITH_MONITORING') {
    return host.monitoringSinkWired === true
      ? { outcome: 'proceed_with_monitoring' }
      : { outcome: 'halt' };
  }
  if (ea === 'REQUEST_APPROVAL') return { outcome: 'request_approval' };
  if (ea === 'STOP') return { outcome: 'halt' };
  // Unrecognised — not permission (well-known).
  if (!CLOSED.has(ea)) return { outcome: 'halt' };
  return { outcome: 'halt' };
}

function toolSelection(input) {
  const change = (input && input.change) || {};
  const held = input && input.held_receipt;
  const intended = input && input.intended;

  // Docs-only: call no tool (DESC_PREFLIGHT Do not use when).
  if (change.kind === 'documentation-only' || change.contract_artifacts_changed === false) {
    // Exception: held receipt about to act under same scope → verify_receipt.
    if (held && held.token && intended
        && held.operation === intended.operation
        && held.target_id === intended.target_id
        && input.situation === 'about_to_act_under_held_receipt') {
      return { tool: 'verify_receipt' };
    }
    if (change.kind === 'documentation-only') return { tool: null };
  }

  // Wrong-scope receipt → preflight again (cannot re-scope via verify).
  if (held && intended
      && (held.operation !== intended.operation || held.target_id !== intended.target_id)) {
    return { tool: 'preflight_change_set' };
  }

  // About to act under held receipt, same scope → verify.
  if (held && held.token && intended
      && held.operation === intended.operation
      && held.target_id === intended.target_id
      && !change.contract_artifacts_changed) {
    return { tool: 'verify_receipt' };
  }

  // Pending contract change → preflight.
  if (change.contract_artifacts_changed === true || change.kind === 'contract') {
    return { tool: 'preflight_change_set' };
  }

  return { tool: null };
}

function referenceSubject(c) {
  if (c.kind === 'decide') return decide(c.input);
  if (c.kind === 'tool_selection') return toolSelection(c.input);
  throw new Error(`unknown case kind: ${c.kind}`);
}

module.exports = { referenceSubject, decide, toolSelection };
