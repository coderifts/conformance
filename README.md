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
| `data-plane` | **Runs** the capability-demo atomic chain (`examples/atomic-v2`) and reports what each hop is evidence *for*. **Not** `cases.v1.json`. Keyless; the two database rows need `CODERIFTS_DATAPLANE_PG`. | capability-demo checkout (pinned) |

```bash
node bin/coderifts-conformance.js --subject reference
node bin/coderifts-conformance.js --subject sdk
node bin/coderifts-conformance.js --subject agent-guard
node bin/coderifts-conformance.js --subject agent-guard --profile enforcement_consistent
node bin/coderifts-conformance.js --subject model-acceptance
node bin/coderifts-conformance.js --subject data-plane
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
| `DECISION_LOGIC` | **COVERED** | 15 vectors run | A consumer branches on `execution_action`, never on `decision` or `safe_for_agent`, and a verdict function is stable for a given input. |
| `RECEIPT_CRYPTO` | **NOT COVERED** | **RETIRED** in 0.4.0 — 0 vectors here; they run in the app and in `receipt-verifier` | A grant or attestation verifies offline against its keyring, and expired / misbound / mis-signed / malformed / unknown-kid / retired-key tokens are refused with a named status. |
| `GUARDED_TOOL_TABLE` | **COVERED** | 6 vectors run | The right tool is selected for a given change, and each description carries the scoping facts a reader depends on. |
| `CREDENTIAL_BOUNDARY` | **NOT COVERED** | no vector exists | A host holding a provider credential cannot reach the target except through the guarded path. |
| `ATOMIC_COMMIT` | **NOT COVERED** | no vector here — executable in `@coderifts/agent-guard` `test/atomic-profile.test.js` | A claim and the mutation it authorises either both happen or neither does, and a replayed nonce buys nothing. |
| `PROVIDER_ENFORCED` | **NOT COVERED** | no vector exists | A provider actually refused a merge or a deploy because the gate said so — observed, not modelled. |
| `END_TO_END` | **NOT COVERED** | no vector exists | The whole chain holds on one real change: decision → receipt → guarded execution → atomic commit → provider enforcement. |

**Two covered, five not covered — of seven.** There is deliberately no `x/7` here:
the profiles are claims of different strength, and a ratio over them re-creates the single number
this split replaced.

### Why the empty ones are empty

- **`RECEIPT_CRYPTO` — RETIRED in 0.4.0. The row is kept; the vectors are gone.** The 23 `EG-*` /
  `EG2-*` / `EG-A-*` / `MON-A-*` cases were vendored from the CodeRifts app into `cases.v1.json`,
  and every shipped subject implements only the `decide` and `tool_selection` kinds — they threw
  `unknown case kind` on the rest. Being outside the default profile, they were never selected and
  never showed up as failures: a third of the case file was data with no runner.

  **A runner here was the wrong fix, and that is why they left rather than gained one.** The case
  inputs carried a scenario *name*, not a token (14 of the 19 were `{ "scenario": "..." }` and
  nothing else), so running them would have meant minting the signed token from that name — a
  generator and a verifier in one repository agreeing with itself.

  **Where they run now, both stronger than a runner here would have been.** In the **app**, against
  the real verify functions (`test/execution-grant.test.js`, `test/execution-attestation.test.js`,
  `test/monitoring-attestation.test.js`, reading the app-only
  `test/adapter-acceptance/receipt-crypto-vectors.v1.json`); and in **`receipt-verifier`** as signed
  token **bytes**, cross-checked by two independent implementations, JS and Python, with 12 of the
  19 under byte-identical IDs (`EG-*` 5/5, `EG-A-*` 7/7). The 7 `MON-A-*` belong in
  `receipt-verifier` and are staged separately.

  **The removal could not start here.** `cases.v1.json` is vendored from the app and gated
  byte-identical by its `test/conformance-cases-vendored-sync.test.js`, so deleting rows here would
  have broken the app's CI. It began at the app-canonical copy and this repo followed.
  `NOT COVERED` is scoped to this suite — it is not a claim that the property is unproven.
- **`CREDENTIAL_BOUNDARY`** — a property of a *running* host's tool table. Every subject here is a
  pure function of case input with no host, so a vector would score a fake host, and a passing fake
  would imply coverage that does not exist. Covered by `@coderifts/bypass-probe` against your own
  installation. Recorded as the excluded vector `raw_tool_beside_guarded_table`.
- **`ATOMIC_COMMIT`** — single-use consumption happens at an executor this suite does not run, and
  the public verifier is stateless. Recorded as `stale_nonce` and `concurrent_grants`.
  **`EG-A-STATE-NONCE-MISMATCH` was never evidence here** despite naming a nonce: it checks that an
  attestation document is unbound, which is a binding fact rather than an atomicity one. It left
  with the rest of `RECEIPT_CRYPTO` in 0.4.0; this profile is unaffected, because it never counted
  here.
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

### The `data-plane` subject

Every other subject here is a pure function of case input. This one executes real code — the
four hops of `examples/atomic-v2/run.js` in the pinned capability-demo checkout — because
`CREDENTIAL_BOUNDARY` and `ATOMIC_COMMIT` are properties of a running system and no pure function
can reach them.

**Measured result, and it is not the flattering one: the keyless run fills zero profiles.** All
four hops pass and none of them is admissible as evidence *here*:

| Row | Hop | Profile it looks like | Why it does not count |
|-----|-----|----------------------|------------------------|
| `DP-1-REQUEST-SHAPE` | 1 | — | A request shape is not one of the seven claims. It is pinned as a type in the SDKs. |
| `DP-2-GRANT-OFFLINE-VERIFY` | 2 | `RECEIPT_CRYPTO` | capability-demo mints the grant and capability-demo verifies it. That is the reason `RECEIPT_CRYPTO` was retired in 0.4.0 — one repository agreeing with itself. It runs for real in the app and in `receipt-verifier`, across two languages. |
| `DP-3-CONSUME-ONCE-KEYLESS` | 3 | `ATOMIC_COMMIT` | `consumeOnce` without a `query` performs no lookup and returns `consumed: true`. `ATOMIC_TRANSACTION` there is a *declaration* about the postgres path, not an observation of it. |
| `DP-4-ATTESTATION-VERIFY` | 4 | `RECEIPT_CRYPTO` | Same retirement as `DP-2`. |

**With `CODERIFTS_DATAPLANE_PG` pointing at a migrated capability-demo database, two rows become
real** — and they are the only two the chain can honestly fill:

| Row | Profile | What it observes | Ceiling |
|-----|---------|------------------|---------|
| `DP-PG-SINGLE-USE` | `ATOMIC_COMMIT` | The same `jti` INSERTed twice into `consumed_grants`; the second raises `23505`. | Proves a replayed `jti` cannot be claimed twice. Does **not** prove the claim and the mutation share one transaction end to end. |
| `DP-PG-SEAL-REQUIRED` | `ATOMIC_COMMIT` | `COMMIT` of a consumed grant with no sealed attestation raises `23514 consumed_unsigned` — the deferred constraint trigger. | Observes the commit-time constraint. Does **not** observe the mutation; `cr_execute_grant` does that, and driving it needs a state challenge. |
| `DP-PG-HOST-CANNOT-WRITE` | `CREDENTIAL_BOUNDARY` (**PARTIAL**) | `cr_host` attempting `UPDATE` on `articles` raises `42501`. | The **database** half only. The tool-table half — a raw tool beside the guarded one — is untouched here and stays with `@coderifts/bypass-probe`. This row can never take the profile past `PARTIAL`. |
| `DP-PG-HOST-CAN-READ` | `CREDENTIAL_BOUNDARY` (**PARTIAL**) | The control: `cr_host` `SELECT` on `articles` succeeds. | Without it, the row above passes just as well when the connection is broken or the table is missing. "The write failed" is not "the write was refused". |

```bash
# keyless — reports skips with reasons, exits 0, and says in words that nothing was proved
node bin/coderifts-conformance.js --subject data-plane

# with a live database
CODERIFTS_DATAPLANE_PG="postgres://demo:demo@localhost:5432/demo" \
  node bin/coderifts-conformance.js --subject data-plane
```

No API key on any path. `pg` is **not** a dependency of this package; it is borrowed from the
capability-demo checkout, and its absence is a named skip. An absent or off-pin checkout is
`capability_demo_absent` / `capability_demo_commit_mismatch` — never silently COVERED.

Every database row runs inside a transaction that is **rolled back**, so a caller's database is
left exactly as it was found.

**These rows do not feed `--profiles` or `--assurance`, on purpose.** Those drive CI gates, and a
gate whose colour depends on whether a database happened to be reachable is worse than one that is
honestly red. The seven-profile report keeps saying `NOT COVERED`, which remains true *of the
suite*; this subject reports separately what a run *with* a database observed.

`DP-PG-SEAL-REQUIRED` was not designed — it was found. The first version of `DP-PG-SINGLE-USE`
INSERTed and committed, and the deferred trigger refused it. That refusal turned out to be the
closest thing this suite can observe to `ATOMIC_COMMIT`'s actual sentence, so it became a row.

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

`b52def10defe59fb4204649ef67cd6a2ce070a68`

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
git checkout b52def10defe59fb4204649ef67cd6a2ce070a68
```

Adapters are loaded from `../capability-demo/demo/src` relative to this repo. Override with `CODERIFTS_CAPABILITY_DEMO` (repo root or `demo/src`). `npm install` may also place the same commit under `node_modules/capability-demo` via the optional git dependency.

**When the checkout is absent** (or at a different commit): the three regressions are **NOT_RUN** / `capability_demo_absent` (or `capability_demo_commit_mismatch`), named, with the expected path and commit. They are **never silently COVERED**. The rest of this suite still runs. An external user who follows the clone+checkout above can reproduce the COVERED run.
