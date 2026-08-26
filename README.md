# @coderifts/conformance

Offline **adapter-acceptance** suite for every consumer of a CodeRifts decision.

Run the **same case file** the CodeRifts SDKs are tested against — no network, no API key, no CodeRifts account.

Cases live in `cases.v1.json` (language-agnostic). Adapters supply a **subject** that maps each case input to an outcome. Scoring rules and the subject interface are defined in [CONTRACT.md](./CONTRACT.md).

## Install / run

```bash
# one-shot (after publish)
npx @coderifts/conformance --subject reference

# from a local checkout of this package
node bin/coderifts-conformance.js --subject reference
```

Exit code **0** iff every selected case passes.

### Subjects shipped here

| Subject | Role | Deps |
|---------|------|------|
| `reference` | Normative pure mapping (well-known + tool DESC) — **should pass** | none |
| `branch-on-decision` | Deliberate **wrong** brancher (uses `decision`, ignores `execution_action`) — **should fail** AA-BRANCH-NOT-DECISION | none |
| `sdk` | Wires `@coderifts/sdk` `readDecision` then normative decide | `@coderifts/sdk` |
| `agent-guard` | Wires `@coderifts/agent-guard` decide helpers (decide cases only) | `@coderifts/agent-guard` |
| `model-acceptance` | Canned OpenAI/Anthropic/Gemini/LangGraph tool-use → `bind*` / `execute*ToolCall`. Scorecard of helper-through consistency. **Not** `cases.v1.json`. | `@coderifts/agent-guard` >=8.1.1 |

```bash
node bin/coderifts-conformance.js --subject reference
node bin/coderifts-conformance.js --subject sdk
node bin/coderifts-conformance.js --subject agent-guard
node bin/coderifts-conformance.js --subject agent-guard --profile enforcement_consistent
node bin/coderifts-conformance.js --subject model-acceptance
```

### Profiles

- `normative` (default) — full consumer branching suite  
- `enforcement_consistent` — subset for guards that fail-closed on decision↔action inconsistency  
- `all` — every case  

## Write your own subject

See [CONTRACT.md](./CONTRACT.md). A subject is:

```text
subject(case) → result
```

No network. No API keys. Branch on `execution_action`, not on `decision` or `safe_for_agent`.

Point your CI at this package so a decision-only brancher fails the same way CodeRifts’ own SDKs would.

## Model-acceptance (helper-through, not model-spontaneous)

**Honesty.** `model-acceptance` proves that **the host wired** `executeOpenAIToolCall` / `executeAnthropicToolCall` / `executeGeminiToolCall` / `executeLangGraphToolCall` (which call `bind*GuardOutcome`) over the **same Change-IR** (`artifacts[]` → `change_fp`) and got the **same verdict** on all four provider shapes. It does **not** prove that OpenAI/Claude/Gemini/LangGraph **spontaneously** call `preflight_change_set`, and it does **not** prove raw tools outside the returned table are inescapable.

Measured bind signatures (guard@6.1; dispatcher later):

| Helper | Input | Output (ProofBound brand is TypeScript-only) |
|--------|--------|-----------------------------------------------|
| `bindOpenAIGuardOutcome(outcome, { tool_call_id })` | `GuardOutcome` + OpenAI `tool_call_id` | `{ role:'tool', tool_call_id, content }` |
| `bindAnthropicGuardOutcome(outcome, { tool_use_id })` | `GuardOutcome` + Anthropic `tool_use_id` | `{ type:'tool_result', tool_use_id, content }` |
| `bindGeminiGuardOutcome(outcome, { name })` | `GuardOutcome` + Gemini function `name` | `{ functionResponse: { name, response } }` (`response` is an object) |
| `bindLangGraphGuardOutcome(outcome, { tool_call_id, name? })` | `GuardOutcome` + LangGraph `tool_call_id` | `{ content, tool_call_id, name? }` |

Canned tool-use fixtures: `fixtures/model-acceptance.v1.json`. Offline; no provider API key. `--json` prints the machine scorecard.

```bash
node bin/coderifts-conformance.js --subject model-acceptance
# or: npm run model-acceptance
```

Exit 0 iff all 4 providers × allow/block rows pass and `change_fp` + verdict are identical across providers. Two-run determinism is asserted in `test/model-acceptance.test.js`.

Local guard newer than the published npm copy: set `CODERIFTS_AGENT_GUARD_DIR` (or keep a sibling `../coderifts-agent-guard` checkout with `dist/`).

## Case source of truth

`cases.v1.json` is **vendored** from the private CodeRifts app (`test/adapter-acceptance/cases.v1.json`). The app CI asserts byte-identity so this public copy cannot silently drift from what the product tests against.

App-private anchor checks (that cases still match live app source text) stay **out of this package** — they require the private app tree.

## License

MIT

## Adversarial vectors

A passing adversarial vector proves that ONE NAMED ATTACK SHAPE fails against the behaviour this suite can reach. It never proves the class is closed, and it is not a security guarantee.

WHAT A PASS ASSERTS: the specific shape named in the vector — that payload, that ordering, that ref form — does not produce the outcome the attacker wanted, at the version recorded in the fixture.

WHAT A PASS DOES NOT ASSERT: that a variant of the same shape fails; that the class the shape belongs to is covered; that the product still behaves this way at a version other than the one recorded; or, where a vector mirrors published logic rather than importing it, that the mirror and the product still agree. That last one is not hypothetical — re-verifying against coderifts@4.12.0 found two divergences in the issuer mirror while every test stayed green, and both would have reported a WRONG verdict to an auditor.

WHY SOME VECTORS ARE ABSENT: four of the auditor's seven are not expressible in an offline, credential-free suite. They are listed in fixtures/adversarial.v1.json under `excluded`, each with its reason and where it IS covered, if anywhere. An absent vector is recorded, never silently dropped — a suite that hides what it cannot test is worse than a smaller honest one.

Run them with the rest of the suite (`npm test`), or alone:

```
node --test test/adversarial.test.js
```

No CodeRifts credential, no network, no account. Three families are carried — issuer collision, MCP negative schema, action tag mutation — and the coverage boundary is a test of its own, so the suite fails if it stops stating what it does not cover.
