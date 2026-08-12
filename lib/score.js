/**
 * Score a subject against acceptance cases (pure).
 *
 * Floor outcomes are fixed. SAFETY cases: zero deviation.
 * LIVENESS cases: stop-direction deviation allowed only with a machine-readable
 * declaration that is demonstrated (present → halt, absent → floor pass).
 *
 * @module @coderifts/conformance/lib/score
 */
'use strict';

/** Higher = more executable. Stop-direction = strictly lower rank than floor. */
const DECIDE_OUTCOME_RANK = Object.freeze({
  proceed: 3,
  proceed_with_monitoring: 2,
  request_approval: 1,
  halt: 0,
});

/**
 * @param {object} expect
 * @param {object} actual
 * @returns {{ ok: boolean, mismatches: string[] }}
 */
function matchExpect(expect, actual) {
  const mismatches = [];
  if (!actual || typeof actual !== 'object') {
    return { ok: false, mismatches: ['subject returned non-object'] };
  }
  for (const [k, v] of Object.entries(expect || {})) {
    if (actual[k] !== v) {
      mismatches.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * Resolve a dotted path on an object (e.g. response.safe_for_agent under case.input).
 * @param {object} root
 * @param {string} path
 */
function getPath(root, path) {
  if (!path || root == null) return undefined;
  const parts = String(path).split('.');
  let cur = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Whether a strictness_allowed.present_when clause holds on case.input.
 * present_when: { "response.safe_for_agent": false } (paths relative to case.input)
 */
function presentWhenHolds(caseInput, presentWhen) {
  if (!presentWhen || typeof presentWhen !== 'object') return false;
  for (const [path, expected] of Object.entries(presentWhen)) {
    if (getPath(caseInput, path) !== expected) return false;
  }
  return true;
}

function isStopDirectionDecide(floorOutcome, actualOutcome) {
  const fr = DECIDE_OUTCOME_RANK[floorOutcome];
  const ar = DECIDE_OUTCOME_RANK[actualOutcome];
  if (fr === undefined || ar === undefined) return false;
  return ar < fr;
}

/**
 * Tool-selection stop-direction: choosing null (no tool) when floor required a tool,
 * or refusing a more active tool. Floor null → any tool is a safety violation (not stop-dir excuse).
 */
function isStopDirectionTool(floorTool, actualTool) {
  if (floorTool == null || floorTool === null) return false; // floor says don't call; proceeding is not stop-dir
  if (actualTool === null || actualTool === undefined) return true; // refused to call when floor said call
  return false; // different non-null tool is not a recognised stop-direction
}

/**
 * @param {object} c case
 * @param {object} actual subject result
 * @returns {boolean}
 */
function isStopDirection(c, actual) {
  if (c.kind === 'decide') {
    return isStopDirectionDecide(c.expect && c.expect.outcome, actual && actual.outcome);
  }
  if (c.kind === 'tool_selection') {
    return isStopDirectionTool(c.expect && c.expect.tool, actual && actual.tool);
  }
  return false;
}

/**
 * Normalize declared_strictnesses from a subject result.
 * @returns {string[]}
 */
function readDeclarations(actual) {
  if (!actual || typeof actual !== 'object') return [];
  const d = actual.declared_strictnesses;
  if (!Array.isArray(d)) return [];
  return d.filter((x) => typeof x === 'string' && x.length > 0);
}

/**
 * Find allowed conjunct entry on a case.
 */
function findAllowed(c, conjunct) {
  const list = c.strictness_allowed;
  if (!Array.isArray(list)) return null;
  return list.find((e) => e && e.conjunct === conjunct) || null;
}

/**
 * Score one case given full subject outputs by id (for absence/presence cross-checks).
 *
 * @param {object} c
 * @param {object|null} actual
 * @param {string|null} error
 * @param {Map<string, { actual: object|null, error: string|null }>} byId
 * @param {Map<string, object>} casesById
 */
function scoreOneCase(c, actual, error, byId, casesById) {
  if (error) {
    return {
      id: c.id,
      ok: false,
      class: c.class || null,
      expect: c.expect,
      actual,
      mismatches: [`threw: ${error}`],
      used_strictnesses: [],
    };
  }

  const floorMatch = matchExpect(c.expect, actual);
  if (floorMatch.ok) {
    // Floor match: declarations not needed; still surface any that were listed (visible cost).
    const listed = readDeclarations(actual);
    return {
      id: c.id,
      ok: true,
      class: c.class || null,
      expect: c.expect,
      actual,
      mismatches: [],
      used_strictnesses: [],
      listed_strictnesses: listed,
    };
  }

  // --- Deviation from floor ---
  const klass = c.class;
  if (klass === 'safety') {
    return {
      id: c.id,
      ok: false,
      class: 'safety',
      expect: c.expect,
      actual,
      mismatches: [
        ...floorMatch.mismatches,
        'safety case: floor is MUST NOT execute — zero deviation (declarations cannot excuse)',
      ],
      used_strictnesses: [],
    };
  }

  if (klass !== 'liveness') {
    return {
      id: c.id,
      ok: false,
      class: klass || null,
      expect: c.expect,
      actual,
      mismatches: [
        ...floorMatch.mismatches,
        `case has no class safety|liveness (got ${JSON.stringify(klass)}) — cannot declare strictness`,
      ],
      used_strictnesses: [],
    };
  }

  // Liveness deviation: only stop-direction + proven declaration.
  if (!isStopDirection(c, actual)) {
    return {
      id: c.id,
      ok: false,
      class: 'liveness',
      expect: c.expect,
      actual,
      mismatches: [
        ...floorMatch.mismatches,
        'liveness deviation is not stop-direction (only more-halting outcomes may be declared)',
      ],
      used_strictnesses: [],
    };
  }

  const decls = readDeclarations(actual);
  if (decls.length === 0) {
    return {
      id: c.id,
      ok: false,
      class: 'liveness',
      expect: c.expect,
      actual,
      mismatches: [
        ...floorMatch.mismatches,
        'liveness stop-direction deviation without declared_strictnesses',
      ],
      used_strictnesses: [],
    };
  }

  const used = [];
  const mismatches = [...floorMatch.mismatches];

  for (const conjunct of decls) {
    const allowed = findAllowed(c, conjunct);
    if (!allowed) {
      mismatches.push(
        `declared conjunct ${JSON.stringify(conjunct)} is not on this case's strictness_allowed`,
      );
      continue;
    }
    // Conjunct must actually be present on THIS case input (not free prose).
    if (!presentWhenHolds(c.input, allowed.present_when)) {
      mismatches.push(
        `declared conjunct ${JSON.stringify(conjunct)} is not present on this case input `
        + `(present_when ${JSON.stringify(allowed.present_when)})`,
      );
      continue;
    }
    // Demonstration: presence — this case already shows stop-direction under the conjunct.
    // Demonstration: absence — floor match on absence_case_id without needing this conjunct.
    const absId = allowed.absence_case_id;
    if (!absId || typeof absId !== 'string') {
      mismatches.push(`conjunct ${conjunct}: strictness_allowed missing absence_case_id`);
      continue;
    }
    const absCase = casesById.get(absId);
    const absRun = byId.get(absId);
    if (!absCase || !absRun) {
      mismatches.push(`conjunct ${conjunct}: absence_case_id ${absId} not in scored set`);
      continue;
    }
    if (absRun.error) {
      mismatches.push(`conjunct ${conjunct}: absence case ${absId} threw: ${absRun.error}`);
      continue;
    }
    // Absence case must NOT have the conjunct present.
    if (presentWhenHolds(absCase.input, allowed.present_when)) {
      mismatches.push(
        `conjunct ${conjunct}: absence_case_id ${absId} still has present_when true — not an absence fixture`,
      );
      continue;
    }
    const absFloor = matchExpect(absCase.expect, absRun.actual);
    if (!absFloor.ok) {
      mismatches.push(
        `conjunct ${conjunct}: undemonstrated — absence case ${absId} does not pass floor `
        + `(${absFloor.mismatches.join('; ')})`,
      );
      continue;
    }
    used.push(conjunct);
  }

  // At least one declared conjunct must fully demonstrate to excuse the deviation.
  if (used.length === 0) {
    if (!mismatches.some((m) => /undeclared|not on this case|undemonstrated|not present|absence/.test(m))) {
      mismatches.push('no declared conjunct was both allowed and demonstrated');
    }
    return {
      id: c.id,
      ok: false,
      class: 'liveness',
      expect: c.expect,
      actual,
      mismatches,
      used_strictnesses: [],
    };
  }

  // Strip pure floor-mismatch noise if we accepted via declaration — keep demonstration notes only if any residual.
  const residual = mismatches.filter((m) => !m.startsWith('outcome:') && !m.startsWith('tool:'));
  return {
    id: c.id,
    ok: true,
    class: 'liveness',
    expect: c.expect,
    actual,
    mismatches: residual,
    used_strictnesses: used,
    excused: true,
  };
}

/**
 * @param {object[]} cases
 * @param {(c: object) => object} subject
 * @returns {{
 *   passed: number,
 *   failed: number,
 *   results: object[],
 *   declared_strictnesses: string[],
 * }}
 */
function scoreSubject(cases, subject) {
  const list = Array.isArray(cases) ? cases : [];
  const casesById = new Map(list.map((c) => [c.id, c]));
  const byId = new Map();

  // First pass: run subject everywhere (declarations and absences need full coverage).
  for (const c of list) {
    let actual = null;
    let error = null;
    try {
      actual = subject(c);
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
    byId.set(c.id, { actual, error });
  }

  const results = [];
  let passed = 0;
  let failed = 0;
  const declaredSet = new Set();

  for (const c of list) {
    const run = byId.get(c.id);
    const r = scoreOneCase(c, run.actual, run.error, byId, casesById);
    if (r.ok) passed += 1;
    else failed += 1;
    for (const s of r.used_strictnesses || []) declaredSet.add(s);
    for (const s of r.listed_strictnesses || []) declaredSet.add(s);
    results.push(r);
  }

  const declared_strictnesses = [...declaredSet].sort();
  return {
    passed,
    failed,
    results,
    declared_strictnesses,
    /** Suite-level summary string for reporters */
    summary:
      failed === 0
        ? (declared_strictnesses.length
          ? `passes, with ${declared_strictnesses.length} declared strictness(es): ${declared_strictnesses.join(', ')}`
          : 'passes, with 0 declared strictnesses')
        : `${failed} failed`,
  };
}

module.exports = {
  matchExpect,
  scoreSubject,
  scoreOneCase,
  isStopDirection,
  isStopDirectionDecide,
  presentWhenHolds,
  getPath,
  readDeclarations,
  DECIDE_OUTCOME_RANK,
};
