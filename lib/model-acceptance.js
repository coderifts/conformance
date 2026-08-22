/**
 * Model-acceptance harness (offline, fixture-based).
 *
 * MEASURED bind helpers (guard@6.1 Option B; dispatcher execute*ToolCall later):
 *   bindOpenAIGuardOutcome(outcome, { tool_call_id, serialize? }) → ProofBoundOpenAIToolMessage
 *     { role:'tool', tool_call_id, content }
 *   bindAnthropicGuardOutcome(outcome, { tool_use_id, serialize? }) → ProofBoundAnthropicToolResult
 *     { type:'tool_result', tool_use_id, content }
 *   bindGeminiGuardOutcome(outcome, { name, serialize? }) → ProofBoundGeminiFunctionResponse
 *     { functionResponse: { name, response } }  // response is an OBJECT
 *   bindLangGraphGuardOutcome(outcome, { tool_call_id, name?, serialize? }) → ProofBoundLangGraphToolMessage
 *     { content, tool_call_id, name? }
 *
 * The TypeScript ProofBound brand is compile-time only. Runtime proof-binding success =
 * the measured wire shape PLUS an embedded guard-execution-proof.v1 (string append or
 * final_answer_proof object).
 *
 * HONESTY: host wires execute*ToolCall / bind*. This is not "the model spontaneously
 * preflights" and not "raw tools outside the table are inescapable".
 *
 * @module @coderifts/conformance/lib/model-acceptance
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'model-acceptance.v1.json');
const PROVIDERS = Object.freeze(['openai', 'anthropic', 'gemini', 'langgraph']);
const PROOF_SPEC = 'guard-execution-proof.v1';

function resolveAgentGuard() {
  const envDir = process.env.CODERIFTS_AGENT_GUARD_DIR;
  const candidates = [
    envDir,
    path.join(__dirname, '..', '..', 'coderifts-agent-guard'),
    path.join(process.env.HOME || '', 'coderifts-agent-guard'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      const g = require(path.join(dir, 'dist', 'cjs'));
      if (typeof g.executeOpenAIToolCall === 'function'
          && typeof g.bindOpenAIGuardOutcome === 'function') {
        return g;
      }
    } catch (_) { /* try next */ }
  }
  let g;
  try {
    g = require('@coderifts/agent-guard');
  } catch (err) {
    throw new Error(
      'model-acceptance: cannot load @coderifts/agent-guard. '
      + 'Set CODERIFTS_AGENT_GUARD_DIR to a guard@8.1+ checkout (dist/cjs). '
      + String(err && err.message),
    );
  }
  if (typeof g.executeOpenAIToolCall !== 'function'
      || typeof g.bindOpenAIGuardOutcome !== 'function') {
    throw new Error(
      'model-acceptance requires @coderifts/agent-guard with bind*GuardOutcome '
      + '(guard@6.1) and execute*ToolCall (guard@8). '
      + 'Installed package is too old. Set CODERIFTS_AGENT_GUARD_DIR.',
    );
  }
  return g;
}

function loadFixture(filePath = FIXTURE_PATH) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = JSON.parse(raw);
  if (!doc || doc.version !== 1 || !Array.isArray(doc.scenarios)) {
    throw new Error('model-acceptance.v1.json must be version 1 with scenarios[]');
  }
  return doc;
}

function signedFor(g, env) {
  return { fp: env.fingerprint, bh: g.computeBodyHash(env) };
}

function envelopeFor(g, fixture, scenario, fingerprint) {
  const pf = scenario.preflight;
  const decision = pf.decision;
  const execution_action = pf.execution_action;
  const env = {
    spec_version: 'decision-result.v1.1',
    decision,
    execution_action,
    decision_id: `dec_ma_${scenario.id}`,
    correlation_id: 'ma-corr',
    evaluated_at: '2026-08-22T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    fingerprint,
    input_fingerprint: fingerprint,
    safe_for_agent: decision === 'ALLOW' || decision === 'WARN',
    analysis_complete: true,
    operation: fixture.operation,
    receipt: {
      token: `tok_ma_${scenario.id}`,
      format_version: 'v4',
      key_id: 'k_ma',
      issued_at: '2026-08-22T00:00:00Z',
    },
  };
  return env;
}

function mockClient(g, env) {
  let lastEnv = env;
  return {
    async authorizeChangeSet(r) {
      return this.preflightChangeSet({ ...r, preflight_mode: 'authorize' });
    },
    async preflightChangeSet() {
      lastEnv = env;
      return {
        decision: env.decision,
        execution_action: env.execution_action,
        decision_result: env,
      };
    },
    async verifyReceipt() {
      return {
        valid: true,
        status: 'VERIFIED_CURRENT',
        payload: signedFor(g, lastEnv),
      };
    },
  };
}

function makeTable(g, fixture, env) {
  const client = mockClient(g, env);
  const { tools } = g.guardToolRegistry(
    [
      {
        name: fixture.tool_name,
        mutationClass: 'mutating',
        execute: async () => ({ applied: true, id: fixture.artifacts[0].id }),
      },
    ],
    { guard: { client, operation: fixture.operation } },
  );
  return tools;
}

function cannedToolUse(fixture, provider, scenarioId) {
  const meta = fixture.providers[provider];
  const id = scenarioId === 'block' ? meta.block_id : meta.allow_id;
  const args = { artifacts: fixture.artifacts };
  switch (provider) {
    case 'openai':
      return {
        id,
        type: 'function',
        function: {
          name: fixture.tool_name,
          arguments: JSON.stringify(args),
        },
      };
    case 'anthropic':
      return {
        type: 'tool_use',
        id,
        name: fixture.tool_name,
        input: args,
      };
    case 'gemini':
      return {
        functionCall: {
          name: fixture.tool_name,
          args,
        },
      };
    case 'langgraph':
      return {
        name: fixture.tool_name,
        tool_call_id: id,
        args,
      };
    default:
      throw new Error(`unknown provider ${provider}`);
  }
}

function dispatchArgs(provider, toolUse, tools) {
  switch (provider) {
    case 'openai':
      return {
        tools,
        tool_call_id: toolUse.id,
        name: toolUse.function.name,
        arguments: toolUse.function.arguments,
      };
    case 'anthropic':
      return {
        tools,
        tool_use_id: toolUse.id,
        name: toolUse.name,
        arguments: toolUse.input,
      };
    case 'gemini':
      return {
        tools,
        name: toolUse.functionCall.name,
        arguments: toolUse.functionCall.args,
      };
    case 'langgraph':
      return {
        tools,
        tool_call_id: toolUse.tool_call_id,
        name: toolUse.name,
        arguments: toolUse.args,
      };
    default:
      throw new Error(`unknown provider ${provider}`);
  }
}

function bindArgs(provider, toolUse) {
  switch (provider) {
    case 'openai':
      return { tool_call_id: toolUse.id };
    case 'anthropic':
      return { tool_use_id: toolUse.id };
    case 'gemini':
      return { name: toolUse.functionCall.name };
    case 'langgraph':
      return { tool_call_id: toolUse.tool_call_id, name: toolUse.name };
    default:
      throw new Error(`unknown provider ${provider}`);
  }
}

function shapeOk(provider, bound) {
  if (!bound || typeof bound !== 'object') return false;
  if (provider === 'openai') {
    return bound.role === 'tool'
      && typeof bound.tool_call_id === 'string'
      && typeof bound.content === 'string';
  }
  if (provider === 'anthropic') {
    return bound.type === 'tool_result'
      && typeof bound.tool_use_id === 'string'
      && typeof bound.content === 'string';
  }
  if (provider === 'gemini') {
    const fr = bound.functionResponse;
    return !!(fr && typeof fr.name === 'string' && fr.response && typeof fr.response === 'object');
  }
  if (provider === 'langgraph') {
    return typeof bound.content === 'string' && typeof bound.tool_call_id === 'string';
  }
  return false;
}

function extractProof(provider, bound) {
  if (provider === 'gemini') {
    const p = bound
      && bound.functionResponse
      && bound.functionResponse.response
      && bound.functionResponse.response.final_answer_proof;
    return p && typeof p === 'object' ? p : null;
  }
  const content = bound && bound.content;
  if (typeof content !== 'string') return null;
  if (!content.includes(PROOF_SPEC) && !/CodeRifts execution proof/i.test(content)) return null;
  return { embedded_text: true, text: content };
}

function changeFpFrom(provider, bound, outcomeProof) {
  if (outcomeProof && outcomeProof.binds_to && outcomeProof.binds_to.change_fp) {
    return outcomeProof.binds_to.change_fp;
  }
  if (provider === 'gemini') {
    const p = extractProof(provider, bound);
    return p && p.binds_to ? p.binds_to.change_fp : null;
  }
  const text = bound && bound.content;
  if (typeof text !== 'string') return null;
  const m = text.match(/change_fp:\s*(\S+)/);
  return m ? m[1] : null;
}

function verdictFrom(outcome, bound, provider) {
  if (outcome && outcome.proof && outcome.proof.verdict_kind) return outcome.proof.verdict_kind;
  if (provider === 'gemini') {
    const p = extractProof(provider, bound);
    return p && p.verdict_kind ? p.verdict_kind : null;
  }
  return null;
}

function stableStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = v[k];
      return out;
    }
    return v;
  });
}

function binders(g) {
  return {
    openai: g.bindOpenAIGuardOutcome,
    anthropic: g.bindAnthropicGuardOutcome,
    gemini: g.bindGeminiGuardOutcome,
    langgraph: g.bindLangGraphGuardOutcome,
  };
}

function dispatchers(g) {
  return {
    openai: g.executeOpenAIToolCall,
    anthropic: g.executeAnthropicToolCall,
    gemini: g.executeGeminiToolCall,
    langgraph: g.executeLangGraphToolCall,
  };
}

/**
 * Run the offline model-acceptance harness.
 * @returns {Promise<object>} scorecard
 */
async function runModelAcceptance(opts = {}) {
  const g = opts.guard || resolveAgentGuard();
  const fixture = opts.fixture || loadFixture(opts.fixturePath);
  const bind = binders(g);
  const exec = dispatchers(g);
  const fingerprint = g.computeCanonicalBundleFingerprint(
    fixture.artifacts,
    { operation: fixture.operation },
  );

  const rows = [];
  const boundByKey = {};

  for (const scenario of fixture.scenarios) {
    const env = envelopeFor(g, fixture, scenario, fingerprint);
    const table = makeTable(g, fixture, env);
    const sharedArgs = { artifacts: fixture.artifacts };
    const sharedOutcome = await g.executeProtectedTool(table, fixture.tool_name, sharedArgs);

    for (const provider of PROVIDERS) {
      const toolUse = cannedToolUse(fixture, provider, scenario.id);
      const bindOut = bind[provider](sharedOutcome, bindArgs(provider, toolUse));
      const dispatched = await exec[provider](dispatchArgs(provider, toolUse, table));

      const bindShape = shapeOk(provider, bindOut);
      const dispatchShape = shapeOk(provider, dispatched);
      const bindProof = extractProof(provider, bindOut);
      const dispatchProof = extractProof(provider, dispatched);
      const fp = changeFpFrom(provider, dispatched, sharedOutcome.proof);
      const verdict_kind = verdictFrom(sharedOutcome, dispatched, provider);
      const executed = sharedOutcome.executed === true;
      const expect = scenario.expect || {};
      const verdictOk = expect.verdict_kind ? verdict_kind === expect.verdict_kind : true;
      const executedOk = typeof expect.executed === 'boolean' ? executed === expect.executed : true;
      const fpOk = typeof fp === 'string' && fp.length > 0 && fp === fingerprint;
      const pass = bindShape && dispatchShape && !!bindProof && !!dispatchProof
        && verdictOk && executedOk && fpOk;

      const key = `${provider}:${scenario.id}`;
      boundByKey[key] = { bind: bindOut, dispatched };
      rows.push({
        provider,
        scenario: scenario.id,
        bind_ok: bindShape && !!bindProof,
        dispatcher_ok: dispatchShape && !!dispatchProof,
        change_fp: fp,
        verdict_kind,
        executed,
        pass,
        mismatches: [
          !bindShape ? 'bind_shape' : null,
          !dispatchShape ? 'dispatch_shape' : null,
          !bindProof ? 'bind_proof_missing' : null,
          !dispatchProof ? 'dispatch_proof_missing' : null,
          !verdictOk ? `verdict ${verdict_kind} != ${expect.verdict_kind}` : null,
          !executedOk ? `executed ${executed} != ${expect.executed}` : null,
          !fpOk ? `change_fp mismatch vs canonical ${fingerprint}` : null,
        ].filter(Boolean),
      });
    }
  }

  const byScenario = {};
  for (const row of rows) {
    if (!byScenario[row.scenario]) byScenario[row.scenario] = [];
    byScenario[row.scenario].push(row);
  }
  const consistency = {};
  for (const [sid, group] of Object.entries(byScenario)) {
    const fps = new Set(group.map((r) => r.change_fp));
    const verdicts = new Set(group.map((r) => r.verdict_kind));
    const allPass = group.every((r) => r.pass);
    consistency[sid] = {
      providers: group.map((r) => r.provider),
      change_fp_consistent: fps.size === 1 && [...fps][0] != null,
      verdict_consistent: verdicts.size === 1,
      change_fp: [...fps][0] || null,
      verdict_kind: [...verdicts][0] || null,
      pass: allPass && fps.size === 1 && verdicts.size === 1,
    };
  }

  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.length - passed;
  const consistencyPass = Object.values(consistency).every((c) => c.pass);

  const scorecard = {
    suite: 'model-acceptance',
    honesty: fixture.honesty,
    canonical_change_fp: fingerprint,
    providers: PROVIDERS.slice(),
    rows,
    consistency,
    passed,
    failed,
    n: rows.length,
    ok: failed === 0 && consistencyPass,
  };

  const canonical = stableStringify({
    suite: scorecard.suite,
    canonical_change_fp: scorecard.canonical_change_fp,
    rows: rows.map((r) => ({
      provider: r.provider,
      scenario: r.scenario,
      bind_ok: r.bind_ok,
      dispatcher_ok: r.dispatcher_ok,
      change_fp: r.change_fp,
      verdict_kind: r.verdict_kind,
      executed: r.executed,
      pass: r.pass,
    })),
    consistency,
    ok: scorecard.ok,
  });

  return { scorecard, canonical, boundByKey, fingerprint };
}

function renderScorecardMarkdown(scorecard) {
  const lines = [
    '# Model-acceptance scorecard',
    '',
    scorecard.honesty,
    '',
    '| Provider | Scenario | bind* | execute* | verdict | change_fp match | Pass |',
    '|----------|----------|-------|----------|---------|-----------------|------|',
  ];
  for (const r of scorecard.rows) {
    const fpCell = r.change_fp === scorecard.canonical_change_fp ? 'yes' : 'no';
    lines.push(
      `| ${r.provider} | ${r.scenario} | ${r.bind_ok ? 'PASS' : 'FAIL'} | ${r.dispatcher_ok ? 'PASS' : 'FAIL'} | ${r.verdict_kind || '—'} | ${fpCell} | ${r.pass ? 'PASS' : 'FAIL'} |`,
    );
  }
  lines.push('');
  lines.push(`**Result:** ${scorecard.passed}/${scorecard.n} rows pass. Suite ${scorecard.ok ? 'PASS' : 'FAIL'}.`);
  lines.push('');
  lines.push('Consistency (same Change-IR → same verdict across the 4 helpers):');
  for (const [sid, c] of Object.entries(scorecard.consistency)) {
    lines.push(
      `- ${sid}: verdict=${c.verdict_kind} change_fp=${c.change_fp} consistent=${c.pass ? 'yes' : 'no'}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function runAndPrint(opts = {}) {
  const { scorecard, canonical } = await runModelAcceptance(opts);
  const md = renderScorecardMarkdown(scorecard);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ scorecard, canonical }, null, 2)}\n`);
  } else {
    process.stdout.write(`${md}\n`);
  }
  return scorecard.ok ? 0 : 1;
}

module.exports = {
  PROVIDERS,
  FIXTURE_PATH,
  loadFixture,
  resolveAgentGuard,
  cannedToolUse,
  runModelAcceptance,
  renderScorecardMarkdown,
  runAndPrint,
  stableStringify,
};
