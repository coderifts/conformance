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

So a run is reported as seven profiles, in chain order, on **two axes that are never conflated**:

- **coverage** — `COVERED` / `PARTIAL` / `NOT_COVERED`
- **evidence_tier** — `LIVE` / `RECORDED` / `MODELLED` / `NOT_RUN`
- plus an execution **result** `PASS` / `FAIL` (COVERED + LIVE + FAIL means the property is covered AND the run found a regression)

**Every profile is listed, including the empty ones** — a reader who sees only the profiles that pass has learned nothing new. Default `--evidence recorded` verifies vendored pinned external artifacts. `--evidence live` produces new proof on available infra and is `NOT_RUN` without it — it does **not** fall back to recorded bytes.

| Profile | Coverage | Evidence | What a COVERED verdict would mean |
|---------|----------|----------|-----------------------------------|
| `DECISION_LOGIC` | **COVERED** | **LIVE** — 15 vectors run now (positive + negative pair) | A consumer branches on `execution_action`, never on `decision` or `safe_for_agent`, and a verdict function is stable for a given input. |
| `RECEIPT_CRYPTO` | **COVERED** | **RECORDED** — receipt-verifier committed signed token bytes (not minted here) | A grant or attestation verifies offline against its keyring, and expired / misbound / mis-signed / malformed / unknown-kid / retired-key tokens are refused with a named status. |
| `GUARDED_TOOL_TABLE` | **COVERED** | **LIVE** — 6 vectors run now (positive + negative pair) | The right tool is selected for a given change, and each description carries the scoping facts a reader depends on. |
| `CREDENTIAL_BOUNDARY` | **COVERED** | **RECORDED** — DENY `42501` + unchanged-state read-back; POINT 3 is that denial, not catalog posture | A host holding a provider credential cannot reach the target except through the guarded path. |
| `ATOMIC_COMMIT` | **COVERED** | **RECORDED** — replay, concurrency, CAS-stale `STATE_DRIFT`, no-consume-only rollback, no-mutation-only 42501, before/after read-backs | A claim and the mutation it authorises either both happen or neither does, and a replayed nonce buys nothing. |
| `PROVIDER_ENFORCED` | **COVERED** | **RECORDED** — raw GitHub dumps: ruleset 22074842 + PR#4 required-context FAILURE+BLOCKED + PR#5 required-context SUCCESS; capture is a local `gh` dump, not OIDC | A provider actually refused a merge or a deploy because the gate said so — observed, not modelled. |
| `END_TO_END` | **PARTIAL** | **RECORDED** — layers exist separately; prove-transcript POINT 8 is MODELLED and does not share a run_id with the GitHub PRs | The whole chain holds on one real change: decision → receipt → guarded execution → atomic commit → provider enforcement. |

**PROFILE COVERAGE 6/7 · EVIDENCE 2 LIVE + 5 RECORDED + 0 MODELLED · OVERALL RECORDED · FULL LIVE false.**
That is a count of COVERED rows plus an evidence breakdown, not a pass-rate over unequal claims.
`MODELLED` cannot become `COVERED`. Every `RECORDED` operational profile carries a non-empty
`does_not_prove`. Conformance never mints evidence (`self_minted:false`).

**COVERED requires both polarities** — at least one positive vector (the capability works) and
one negative vector (a real mismatch is refused). A profile with only one half is not covered.
`PARTIAL` is earned when recorded evidence exists but a required negative or read-back is
missing — the gap is named, never filled in.

### Why the empty ones are empty

- **`RECEIPT_CRYPTO` — RETIRED from `cases.v1.json` in 0.4.0; RECORDED from receipt-verifier in
  this release.** The 23 `EG-*` / `EG2-*` / `EG-A-*` / `MON-A-*` cases were vendored from the
  CodeRifts app into `cases.v1.json`, and every shipped subject implements only the `decide` and
  `tool_selection` kinds. A runner here was the wrong fix: the inputs carried a scenario *name*,
  not a token, so running them would have meant minting the signed token from that name — a
  generator and a verifier in one repository agreeing with itself. The removal could not start
  here (`cases.v1.json` is vendored from the app and gated byte-identical).

  **What changed:** this suite now **verifies** receipt-verifier's committed signed token bytes
  (`fixtures/recorded/receipt-crypto/vectors.json`, pin
  `sha256:b2ac4482763ad3c4d743e0073f418740f08083f37b397d6074fea3a4ccf93532`, generator
  `test/gen-vectors.js`, producer commit `4d3cc48d36a2ee7ff256eec8d76f819843bfd429`). Positive
  VALID tokens pass; the byte-level FORGED negative (`tampered_fp`) reuses the VALID signature
  over broken protected content and must fail; field-level tampers (sig / key / audience /
  operation / expired / version) are scored. Conformance does not mint these tokens
  (`self_minted:false`). A digest-pin mismatch is an error. `does_not_prove`: the live kernel
  mints this today; the production signing key is current; the key-discovery endpoint is fresh;
  the grant is currently executable. `--evidence live` without a kernel is `NOT_RUN` and does
  not fall back.
- **`CREDENTIAL_BOUNDARY` — COVERED / RECORDED.** The signed prove-transcript DENY panel carries
  a real target-side denial: `cr_host` INSERT → Postgres `SQLSTATE 42501` (not Node 403, not
  exit-78), with articles count BEFORE and AFTER the attempt (unchanged). POINT 3 is that
  denial, not the catalog posture receipt. `does_not_prove` is non-empty (another credential,
  another target, raw shell, current config). db.js comments are MODELLED
  source and are not counted.
- **`ATOMIC_COMMIT` — COVERED / RECORDED.** The same correlated transcript shows single-use
  (replay 201 then 409 `GRANT_CONSUMED`), concurrency (`ok=1 grew=1`), CAS-stale (`STATE_DRIFT`,
  row unchanged, jti not consumed), no-consume-only (crash-before-seal rolled back article AND
  ledger), no-mutation-only (executor raw INSERT `42501`), and before/after read-backs on the
  positive commit and every negative. `EG-A-STATE-NONCE-MISMATCH` was never evidence here.
  POINT 8 merge stays MODELLED and is not this profile. The artifact records
  `working_tree_dirty:false` (generated from a clean checkout of `3a34079`).
- **`PROVIDER_ENFORCED` — COVERED / RECORDED.** Raw GitHub API dumps of `coderifts/demo`, not a
  CodeRifts summary. Ruleset `22074842` (`coderifts-enforcement`, required `CodeRifts / contract-gate`,
  `integration_id` 2860592, `refs/heads/main`, enforcement active). Negative pole: PR#4 head
  `4b2062b9`, REST `mergeable_state` blocked, required context `CodeRifts / contract-gate`
  COMPLETED FAILURE (app 2860592). Positive pole: PR#5 head `df76f7a7`, required context
  `CodeRifts / contract-gate` SUCCESS (same app). Both poles on that required context — not
  the differently-named `CodeRifts — API Contract Check`. Capture provenance: local `gh api`
  by `zsobpeter-code` on 2026-09-05, `oidc_attested:false`. Negative dump is REST (PR +
  check-runs); positive dump is GraphQL — the shapes as captured. `ADV-1` still does not
  count here. `does_not_prove` names HISTORICAL freshness, bypass actors, local gh token,
  and that PR#5 remains BEHIND. A captured HTTP 405 merge-refusal is a **separate**
  recorded artifact (`fixtures/recorded/bypass-attempt`, claim `observed_bypass_failure`)
  — it does not change this profile's COVERED status. The 1105 canary design remains
  the cost model for a *live* 405 observation.
- **`observed_bypass_failure` — recorded artifact, not an eighth profile.** Admin
  `PUT …/pulls/{4,5}/merge` returned HTTP **405** naming required context
  `CodeRifts / contract-gate`. PR#4 reason is **failing** (gate refused the merge).
  PR#5 reason is **expected** (gate-specificity control, not a gate-refusal; the
  branch is BEHIND). Freshness HISTORICAL, local gh admin token, `oidc_attested:false`.
  The 405 bodies do not identify the actor or the PR; the pin binds path → payload.
  A gate-SUCCESS + up-to-date merge was not observed.
- **`END_TO_END` — PARTIAL / RECORDED.** The layers are recorded; they are not one run. The
  prove-transcript is a Postgres executor whose POINT 8 merge is MODELLED. The provider bundle
  is GitHub PRs with different commits and a different `run_id`. A collage of separate artifacts
  is layer-coverage, not end-to-end. Not COVERED.

### Empty profiles never render green

`0/0` is rejected as a rendering, in every format. It is not merely unclear — it is the *same
shape* as a pass: `14/14` and `0/0` both read as "everything selected succeeded", and a dashboard
averaging ratios scores `0/0` as 100%. `NOT COVERED` cannot be misread that way because it is not a
number. A count is printed only where a count means something.

```bash
node bin/coderifts-conformance.js --profiles          # the table above (default --evidence recorded)
node bin/coderifts-conformance.js --profiles --json   # machine shape, explicit `green` per profile
node bin/coderifts-conformance.js --evidence live --profiles   # NOT_RUN for recorded profiles; no fallback
node bin/coderifts-conformance.js --assurance RECEIPT_CRYPTO   # exit 0 in recorded mode (COVERED / RECORDED)
node bin/coderifts-conformance.js --assurance ATOMIC_COMMIT    # exit 0 in recorded mode (COVERED / RECORDED)
node bin/coderifts-conformance.js --assurance PROVIDER_ENFORCED # exit 0 in recorded mode (COVERED / RECORDED)
node bin/coderifts-conformance.js --assurance END_TO_END        # exit 3 — PARTIAL (no correlated run)
```

`--assurance <ID>` exits **0** only when that profile is COVERED (LIVE or RECORDED), **3** when it
is PARTIAL, NOT RUN or NOT COVERED, and **2** for an unknown id. Exit 3 is distinct from exit 1 on
purpose: "nothing proved this" is not "this was disproved". A CI job pointed at a PARTIAL or empty
profile fails instead of going green forever.

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
honestly red. The seven-profile report takes `CREDENTIAL_BOUNDARY` / `ATOMIC_COMMIT` from the
**recorded** prove-transcript (COVERED / RECORDED), not from this live subject. Data-plane
skips remain true of the live path; this subject reports separately what a run *with* a database
observed.

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

`188479a15ecb2f4ef57f437d0cec67d94e3598fd`

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
git checkout 188479a15ecb2f4ef57f437d0cec67d94e3598fd
```

Adapters are loaded from `../capability-demo/demo/src` relative to this repo. Override with `CODERIFTS_CAPABILITY_DEMO` (repo root or `demo/src`). `npm install` may also place the same commit under `node_modules/capability-demo` via the optional git dependency.

**When the checkout is absent** (or at a different commit): the three regressions are **NOT_RUN** / `capability_demo_absent` (or `capability_demo_commit_mismatch`), named, with the expected path and commit. They are **never silently COVERED**. The rest of this suite still runs. An external user who follows the clone+checkout above can reproduce the COVERED run.
