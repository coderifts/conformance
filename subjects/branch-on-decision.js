/**
 * Deliberately WRONG subject — branches on `decision`, ignores execution_action.
 * Used as a fixture: the suite must FAIL this subject on AA-BRANCH-NOT-DECISION.
 */
'use strict';

function branchOnDecisionSubject(c) {
  if (c.kind === 'tool_selection') {
    // Even wrong subjects may still pick tools correctly for isolation; only decide is poisoned.
    const { toolSelection } = require('./reference');
    return toolSelection(c.input);
  }
  if (c.kind !== 'decide') throw new Error(`unknown kind ${c.kind}`);

  const d = c.input && c.input.response && c.input.response.decision;
  const host = (c.input && c.input.host) || {};

  // Wrong mapping: decision → proceed/halt (classic adapter bug).
  if (d === 'ALLOW') return { outcome: 'proceed' };
  if (d === 'WARN') {
    return host.monitoringSinkWired === true
      ? { outcome: 'proceed_with_monitoring' }
      : { outcome: 'halt' };
  }
  if (d === 'REQUIRE_APPROVAL') return { outcome: 'request_approval' };
  if (d === 'BLOCK') return { outcome: 'halt' };
  return { outcome: 'halt' };
}

module.exports = { branchOnDecisionSubject };
