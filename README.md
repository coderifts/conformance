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

## Assurance profiles — what a run actually proves

This suite used to report a single conformance number. One number collapses seven claims of very
different strength: "an adapter branches on `execution_action`" and "a merge was refused at the
provider" are not the same evidence, and a total cannot tell you which of them is held. It is also
silent about what was never attempted.

So a run is reported as seven profiles, in chain order. **Every profile is listed, including the
empty ones** — a reader who sees only the profiles that pass has learned nothing new.

| Profile | Status | Evidence here | What a COVERED verdict would mean |
|---------|--------|---------------|-----------------------------------|
| `DECISION_LOGIC` | **COVERED** | 13 vectors run | A consumer branches on `execution_action`, never on `decision` or `safe_for_agent`, and a verdict function is stable for a given input. |
| `RECEIPT_CRYPTO` | **NOT RUN** | 19 vectors present, **none executable here** | A grant or attestation verifies offline against its keyring, and expired / misbound / mis-signed / malformed / unknown-kid / retired-key tokens are refused with a named status. |
| `GUARDED_TOOL_TABLE` | **COVERED** | 6 vectors run | The right tool is selected for a given change, and each description carries the scoping facts a reader depends on. |
| `CREDENTIAL_BOUNDARY` | **NOT COVERED** | no vector exists | A host holding a provider credential cannot reach the target except through the guarded path. |
| `ATOMIC_COMMIT` | **NOT COVERED** | no vector here — executable in `@coderifts/agent-guard` `test/atomic-profile.test.js` | A claim and the mutation it authorises either both happen or neither does, and a replayed nonce buys nothing. |
| `PROVIDER_ENFORCED` | **NOT COVERED** | no vector exists | A provider actually refused a merge or a deploy because the gate said so — observed, not modelled. |
| `END_TO_END` | **NOT COVERED** | no vector exists | The whole chain holds on one real change: decision → receipt → guarded execution → atomic commit → provider enforcement. |

**Two covered, one not run, four not covered — of seven.** There is deliberately no `x/7` here:
the profiles are claims of different strength, and a ratio over them re-creates the single number
this split replaced.

### Why the empty ones are empty

- **`RECEIPT_CRYPTO` — NOT RUN, which is not the same as covered or absent.** The 19 vectors are
  vendored from the CodeRifts app and are right there in `cases.v1.json`, but every shipped subject
  implements only the `decide` and `tool_selection` kinds and throws `unknown case kind` on the
  rest. They are also outside the default profile, so they were never selected and never showed up
  as failures. This profile is data, not evidence.

  **Measured 2026-08-27 — the recommendation is REMOVAL, not a runner.** The case inputs carry a
  scenario *name*, not a token: 14 of the 19 are `{ "scenario": "..." }` and nothing else. Running
  them would mean minting the signed token from that name, so a runner here would be a generator
  and a verifier in one repository agreeing with itself. `receipt-verifier` runs the equivalent
  vectors as **signed token bytes** — cross-checked by two independent implementations, JS and
  Python — and **12 of the 19 already run there under byte-identical IDs** (`EG-*` 5/5, `EG-A-*`
  7/7). The 7 `MON-A-*` have no home there yet and belong there rather than here. The removal
  cannot start in this repository: `cases.v1.json` is vendored and gated byte-identical from the
  app, so it begins at the app-canonical copy.
- **`CREDENTIAL_BOUNDARY`** — a property of a *running* host's tool table. Every subject here is a
  pure function of case input with no host, so a vector would score a fake host, and a passing fake
  would imply coverage that does not exist. Covered by `@coderifts/bypass-probe` against your own
  installation. Recorded as the excluded vector `raw_tool_beside_guarded_table`.
- **`ATOMIC_COMMIT`** — single-use consumption happens at an executor this suite does not run, and
  the public verifier is stateless. Recorded as `stale_nonce` and `concurrent_grants`.
  **`EG-A-STATE-NONCE-MISMATCH` is not evidence here** despite naming a nonce: it checks that an
  attestation document is unbound, which is a binding fact, and it counts under `RECEIPT_CRYPTO`.
- **`PROVIDER_ENFORCED`** — needs a live provider and a credential. The only thing that would move
  it is a *negative canary* (a deliberate refusal, observed); its cost and its limits are measured
  in [docs/1105-negative-canary-design.md](./docs/1105-negative-canary-design.md), which is a
  design and **not** an implementation. `ADV-1` looks like coverage and
  is not: it *mirrors* the published required-check evaluator, and a mirror agreeing with itself is
  not a provider refusing anything. It counts under `DECISION_LOGIC`. Recorded as `ruleset_bypass`.
- **`END_TO_END`** — no vector was ever written, and it depends on four profiles that are
  themselves not covered here. It has no `excluded` entry because nothing was attempted.

### Empty profiles never render green

`0/0` is rejected as a rendering, in every format. It is not merely unclear — it is the *same
shape* as a pass: `14/14` and `0/0` both read as "everything selected succeeded", and a dashboard
averaging ratios scores `0/0` as 100%. `NOT COVERED` cannot be misread that way because it is not a
number. A count is printed only where a count means something.

```bash
node bin/coderifts-conformance.js --profiles          # the table above
node bin/coderifts-conformance.js --profiles --json   # machine shape, explicit `green` per profile
node bin/coderifts-conformance.js --assurance ATOMIC_COMMIT   # exit 3 — gate CI on one claim
```

`--assurance <ID>` exits **0** only when that profile is COVERED, **3** when it is NOT RUN or NOT
COVERED, and **2** for an unknown id. Exit 3 is distinct from exit 1 on purpose: "nothing proved
this" is not "this was disproved". A CI job pointed at an empty profile fails instead of going
green forever.

One vector fits none of the seven and is recorded rather than forced: **`ADV-6`** (SHA pin vs the
moving `@v0` tag) asserts supply-chain integrity of the enforcing component, which is a
*precondition* for provider enforcement rather than enforcement, and is not a verdict, a token or a
tool. Forcing it into the nearest profile would make that profile's name overclaim. See
`UNPLACED` in `lib/assurance-profiles.js`.

The ten `COVERAGE BOUNDARY` / `RE-VERIFICATION RECORD` tests count toward **no** profile: they
assert properties of the fixture, and letting the suite score itself for describing itself is
exactly the inflation this split prevents.

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

## Attack-matrix runner (five-point execution; contract rows stay NOT_RUN)

`lib/attack-matrix-runner.js` executes a vector only when the row names an `execute` id that maps to a shipped adapter. **COVERED** means all five points (target, nonce, executor, attestation, gate) were checked by that run — not that the JSON declared an expected outcome. Rows with no `execute` id stay **NOT_RUN**, named. The runner does not invent a verifier and does not call `issueExecutionGrant`. `ATOMIC_COMMIT` stays **NOT COVERED**.

Executed regressions (fail-closed): git missing `expected_old_sha` (`4742476`), HTTP missing/weak ETag (`0988a20`), reconciler forged attestation (`eeae7e7`). Stated-contract consumeAndCommit rows (replay, expired-nonce, payload-swap, missing-attestation) remain recorded, not executed. Pending-contract: raw-tool, concurrent, stale-state. This file does **not** enlarge `adversarial.v1.json` `excluded[]` (still exactly four).

### capability-demo (declared, commit-pinned — required for the three executed regressions)

Those three regressions load the **shipped adapters** from [capability-demo](https://github.com/coderifts/capability-demo) (`git-atomic.js`, `http-atomic.js`, `reconcile.js`). capability-demo is a **demo repo** (`private: true` in its package.json) — it is **not** on npm. The pin lives in this package's `package.json` (`coderifts.capability_demo` and `optionalDependencies`).

**Pinned commit** (the checkout COVERED expectations were measured against):

`14c82bb6697565c4b0918a19b53250a37a3d6a64`

**Sibling checkout** (path the runner looks for by default):

```
<parent>/
  capability-demo/          # git clone + checkout the pin
  coderifts-conformance/    # this repo
```

```bash
cd <parent>
git clone https://github.com/coderifts/capability-demo.git
cd capability-demo
git checkout 14c82bb6697565c4b0918a19b53250a37a3d6a64
```

Adapters are loaded from `../capability-demo/demo/src` relative to this repo. Override with `CODERIFTS_CAPABILITY_DEMO` (repo root or `demo/src`). `npm install` may also place the same commit under `node_modules/capability-demo` via the optional git dependency.

**When the checkout is absent** (or at a different commit): the three regressions are **NOT_RUN** / `capability_demo_absent` (or `capability_demo_commit_mismatch`), named, with the expected path and commit. They are **never silently COVERED**. The rest of this suite still runs. An external user who follows the clone+checkout above can reproduce the COVERED run.
