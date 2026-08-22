'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVIDERS,
  loadFixture,
  cannedToolUse,
  runModelAcceptance,
  renderScorecardMarkdown,
  stableStringify,
} = require('../lib/model-acceptance');

describe('model-acceptance fixtures', () => {
  it('declares four providers and two scenarios with honesty text', () => {
    const doc = loadFixture();
    assert.equal(doc.version, 1);
    assert.deepEqual(Object.keys(doc.providers).sort(), [...PROVIDERS].sort());
    assert.deepEqual(doc.scenarios.map((s) => s.id), ['allow', 'block']);
    assert.match(doc.honesty, /does NOT prove that a model spontaneously/i);
    assert.match(doc.honesty, /HOST wires/i);
  });

  it('canned tool-use shapes match measured provider faces', () => {
    const doc = loadFixture();
    const oai = cannedToolUse(doc, 'openai', 'allow');
    assert.equal(oai.type, 'function');
    assert.equal(oai.function.name, doc.tool_name);
    assert.equal(typeof oai.function.arguments, 'string');
    const ant = cannedToolUse(doc, 'anthropic', 'block');
    assert.equal(ant.type, 'tool_use');
    assert.equal(ant.name, doc.tool_name);
    assert.ok(ant.input && Array.isArray(ant.input.artifacts));
    const gem = cannedToolUse(doc, 'gemini', 'allow');
    assert.equal(gem.functionCall.name, doc.tool_name);
    const lg = cannedToolUse(doc, 'langgraph', 'block');
    assert.equal(lg.name, doc.tool_name);
    assert.equal(typeof lg.tool_call_id, 'string');
  });
});

describe('model-acceptance harness (offline)', () => {
  it('all 4 providers × allow/block pass; Change-IR and verdict are provider-independent', async () => {
    const { scorecard } = await runModelAcceptance();
    assert.equal(scorecard.ok, true, JSON.stringify(scorecard.rows.filter((r) => !r.pass), null, 2));
    assert.equal(scorecard.failed, 0);
    assert.equal(scorecard.n, 8);
    assert.equal(scorecard.passed, 8);
    for (const p of PROVIDERS) {
      const allow = scorecard.rows.find((r) => r.provider === p && r.scenario === 'allow');
      const block = scorecard.rows.find((r) => r.provider === p && r.scenario === 'block');
      assert.ok(allow && allow.pass, p + ' allow');
      assert.ok(block && block.pass, p + ' block');
      assert.equal(allow.verdict_kind, 'ALLOW');
      assert.equal(block.verdict_kind, 'BLOCK');
      assert.equal(allow.executed, true);
      assert.equal(block.executed, false);
      assert.equal(allow.change_fp, scorecard.canonical_change_fp);
      assert.equal(block.change_fp, scorecard.canonical_change_fp);
    }
    assert.equal(scorecard.consistency.allow.pass, true);
    assert.equal(scorecard.consistency.block.pass, true);
    assert.equal(scorecard.consistency.allow.change_fp, scorecard.consistency.block.change_fp);
  });

  it('determinism: two runs produce byte-identical canonical scorecards', async () => {
    const a = await runModelAcceptance();
    const b = await runModelAcceptance();
    assert.equal(a.canonical, b.canonical);
    assert.equal(a.scorecard.ok, true);
    const again = stableStringify({
      suite: a.scorecard.suite,
      canonical_change_fp: a.scorecard.canonical_change_fp,
      rows: a.scorecard.rows.map((r) => ({
        provider: r.provider,
        scenario: r.scenario,
        bind_ok: r.bind_ok,
        dispatcher_ok: r.dispatcher_ok,
        change_fp: r.change_fp,
        verdict_kind: r.verdict_kind,
        executed: r.executed,
        pass: r.pass,
      })),
      consistency: a.scorecard.consistency,
      ok: a.scorecard.ok,
    });
    assert.equal(again, a.canonical);
  });

  it('scorecard markdown names the honest boundary and 4 providers', async () => {
    const { scorecard } = await runModelAcceptance();
    const md = renderScorecardMarkdown(scorecard);
    assert.match(md, /does NOT prove that a model spontaneously/i);
    for (const p of PROVIDERS) assert.match(md, new RegExp('\\| ' + p + ' \\|'));
    assert.match(md, /8\/8 rows pass/);
  });
});
