# Changelog

## 0.8.0

Warrants a MINOR bump: `PROVIDER_ENFORCED` moves NOT_COVERED → COVERED / RECORDED from raw
GitHub dumps. `--assurance PROVIDER_ENFORCED` exits **0** in default recorded mode.
`END_TO_END` moves to PARTIAL / RECORDED (collage of separate artifacts, no shared run_id) —
`--assurance END_TO_END` still exits **3**.

### Added — PROVIDER_ENFORCED from two-pole GitHub readbacks

Vendored `fixtures/recorded/provider-enforced/`: REST ruleset `22074842` (788 bytes,
`sha256:363ae6b9…`), GraphQL PR#10 (`statusCheckRollup` FAILURE, head `146f19c9`) and PR#5
(SUCCESS, head `df76f7a7`). Capture provenance is a local `gh api` dump
(`oidc_attested:false`, actor `zsobpeter-code`, no Actions workflow-run bind). GitHub
payloads are not GitHub-signed. Both poles `mergeStateStatus` BEHIND — the CHECK verdict is
the evidence, not a 405 merge. `does_not_prove` is non-empty (HISTORICAL freshness, bypass
actors, check-name split on PR#10 vs required `contract-gate`, local gh token).

Sub-tiers: configuration_readback RECORDED, negative_enforcement_observation RECORDED,
overall RECORDED. Live mode without gh is NOT_RUN and does not fall back.

### Changed — END_TO_END is PARTIAL, not COVERED

Measured: prove-transcript `run_id` `prove-fb70d9ad-…` (Postgres executor, POINT 8 MODELLED)
does not share a run_id or commit with the GitHub capture. Covering the six layers separately
is not one correlated change.

Default recorded report: **PROFILE COVERAGE 6/7 · EVIDENCE 2 LIVE + 5 RECORDED + 0 MODELLED ·
OVERALL RECORDED · FULL LIVE false.**

## 0.7.0

Warrants a MINOR bump: `CREDENTIAL_BOUNDARY` and `ATOMIC_COMMIT` move PARTIAL → COVERED /
RECORDED. `--assurance` on either id exits **0** in default recorded mode (it exited 3 in 0.6.0).

### Changed — prove-transcript re-vendored with the missing negatives

The capability-demo prove run now records, signs, and read-back-checks:

- DENY unchanged-state (`before_count === after_count` after SQLSTATE 42501); POINT 3 is that denial, not catalog posture
- CAS-stale (`STATE_DRIFT`, row unchanged, jti not consumed)
- no-consume-only (crash-before-seal rolls back article AND ledger)
- no-mutation-only (executor raw INSERT 42501, no consume)
- before/after counts on the positive commit and every negative

`measureCredential` / `measureAtomic` require every panel to verify against the signed bytes.
COVERED only when the set is complete. `does_not_prove` stays non-empty. POINT 8 merge stays
MODELLED and is not these profiles. Pin:
`sha256:a7164cb56e23ce39e10e176c974ee6fb6eaff94fe02f31ae16e2d987a3ac4096`.

Default recorded report: **PROFILE COVERAGE 5/7 · EVIDENCE 2 LIVE + 3 RECORDED + 0 MODELLED ·
OVERALL RECORDED · FULL LIVE false.**

## 0.6.0

Warrants a MINOR bump: a new `--evidence` flag, a two-axis profile report (coverage ×
evidence_tier), and `RECEIPT_CRYPTO` moving COVERED / RECORDED. `--assurance RECEIPT_CRYPTO`
exits **0** in the default recorded mode (it exited 3 while the profile was empty). PARTIAL is
not COVERED: `--assurance CREDENTIAL_BOUNDARY` and `--assurance ATOMIC_COMMIT` still exit 3.

### Added — two-axis status + evidence envelope

Coverage (`COVERED` / `PARTIAL` / `NOT_COVERED`) is no longer conflated with evidence tier
(`LIVE` / `RECORDED` / `MODELLED` / `NOT_RUN`). Execution result (`PASS` / `FAIL`) is a third
field: COVERED + LIVE + FAIL covers the property and found a regression.

`lib/evidence-envelope.js` validates `cr.conformance.v1`: envelope signature, attached byte
hashes, subject digest, positive+negative semantics, cross-artifact bindings. `self_minted`
must be `false`. MODELLED cannot be promoted to COVERED on an operational profile.
`does_not_prove` must be non-empty for every RECORDED operational profile.

`--evidence recorded` (default) verifies vendored pinned external artifacts.
`--evidence live` produces new proof on available infra; without infra those profiles are
`NOT_RUN` and do **not** fall back to recorded bytes.

### Added — three recorded profiles from existing external artifacts

- **`RECEIPT_CRYPTO` → COVERED / RECORDED.** receipt-verifier committed signed token vectors
  (`fixtures/recorded/receipt-crypto/vectors.json`, sha256
  `b2ac4482763ad3c4d743e0073f418740f08083f37b397d6074fea3a4ccf93532`, generator
  `test/gen-vectors.js`, producer `4d3cc48d36a2ee7ff256eec8d76f819843bfd429`). Positive VALID
  passes; byte-level FORGED negative (`tampered_fp`, same signature, broken body) fails;
  field-level tampers (sig / key / audience / operation / expired / version) are scored. A
  digest-pin mismatch errors. Conformance does not mint these tokens. `does_not_prove`: the
  live kernel mints this today; the production signing key is current; the key-discovery
  endpoint is fresh; the grant is currently executable. The 0.4.0 retirement from
  `cases.v1.json` stands — a mint-then-verify runner here would still agree with itself.

- **`CREDENTIAL_BOUNDARY` → PARTIAL / RECORDED.** The signed prove-transcript DENY panel
  carries a real target-side denial (`cr_host` INSERT → SQLSTATE `42501`, not Node 403).
  POINT 3 is a catalog posture receipt, not that denial. **Gap named:** no unchanged-state
  read-back in the signed deny evidence. Not COVERED.

- **`ATOMIC_COMMIT` → PARTIAL / RECORDED.** Same correlated run: replay 201 then 409
  `GRANT_CONSUMED`, concurrency `ok=1 grew=1`. **Gaps named:** stale `state_token` CAS,
  consume-only (`skip-seal`), mutation-only, before/after read-backs. POINT 8 merge is
  MODELLED and is not promoted. db.js / server.js comments are MODELLED source, not counted.

Default recorded report: **PROFILE COVERAGE 3/7 · EVIDENCE 2 LIVE + 3 RECORDED + 0 MODELLED ·
OVERALL RECORDED · FULL LIVE false.**

## 0.5.0

Warrants a MINOR bump when released: a new `--subject` value and a moved dependency pin, no
breaking change to an existing flag, exit code, subject interface or output shape. Released 2026-09-02.

### Added — the `data-plane` subject

The first subject that RUNS something instead of computing it: `--subject data-plane` executes the
four hops of `examples/atomic-v2/run.js` in the pinned capability-demo checkout and reports what
each hop is evidence *for*. `CREDENTIAL_BOUNDARY` and `ATOMIC_COMMIT` are properties of a running
system, and `lib/assurance-profiles.js` already said no pure subject could reach them.

**The keyless run fills zero profiles, and says so in words.** All four hops pass; none is
admissible here. Two are `RECEIPT_CRYPTO`, retired in 0.4.0 precisely because capability-demo both
mints and verifies those tokens — one repository agreeing with itself. One is `consumeOnce` called
with no `query`, which performs no lookup at all and returns `consumed: true`; its
`ATOMIC_TRANSACTION` strength is a declaration about the postgres path, not an observation of it.
One is a request shape, which is not one of the seven claims.

With `CODERIFTS_DATAPLANE_PG` set, four rows become real observations:

- `DP-PG-SINGLE-USE` — the same `(deployment_id, jti)` INSERTed twice raises `23505`, with a
  tenancy control (same `jti`, different `deployment_id`) that must succeed.
- `DP-PG-SEAL-REQUIRED` — committing a consumed grant with no sealed attestation raises
  `23514 consumed_unsigned`. Not designed; found, when the first version of the row above tried to
  commit and the deferred constraint trigger refused it.
- `DP-PG-HOST-CANNOT-WRITE` / `DP-PG-HOST-CAN-READ` — `cr_host` is denied `UPDATE` on `articles`
  (`42501`) while `SELECT` succeeds. `CREDENTIAL_BOUNDARY` is capped at `PARTIAL` by construction:
  this is the database half, and the tool-table half stays with `@coderifts/bypass-probe`.

Every database row runs inside a transaction that is rolled back. `pg` is not a dependency of this
package; it is borrowed from the capability-demo checkout, and its absence is a named skip. These
rows do not feed `--profiles` or `--assurance` — those drive CI gates, and a gate whose colour
depends on whether a database was reachable is worse than one that is honestly red.

### Changed — the capability-demo pin moved to `d26d11d`

From `14c82bb`. Not routine freshening: `examples/atomic-v2/run.js` was added AT `d26d11d` and does
not exist at `14c82bb`, so the new subject could never have run against the old pin. Measured side
effect, recorded because it is a coverage change: `npm test` went from 116 tests with 2 skipped to
119 with 0. The three attack-matrix regressions were `NOT_RUN` under the old pin
(`capability_demo_commit_mismatch` against the local sibling) and now execute.

## 0.4.0

The canonical case file is vendored byte-identical from the CodeRifts app, so this release
follows the app's retirement of the `RECEIPT_CRYPTO` vectors. Reported as MINOR: the published
case set shrinks and one profile changes status, which is a contract change for a consumer
pinning case ids, but no CLI flag, exit code, subject interface or output shape moves.

### Changed

- **`RECEIPT_CRYPTO` is RETIRED — 23 vectors removed, the profile row KEPT.** The `EG-*`,
  `EG2-*`, `EG-A-*` and `MON-A-*` cases were vendored into `cases.v1.json` and none of them
  could execute here: every shipped subject implements only the `decide` and `tool_selection`
  kinds and threw `unknown case kind` on the other three. Sitting outside the default profile,
  they never surfaced as failures — a third of the case file was data with no runner.

  A runner was the wrong fix, which is why they left rather than gained one: the inputs carried
  a scenario *name*, not a token (14 of the 19 were `{ "scenario": "…" }` and nothing else), so
  running them would have meant minting the token that was then verified — a generator and a
  verifier in one repository agreeing with itself.

  They run in two better places. In the **app**, against the real verify functions
  (`test/execution-grant.test.js`, `test/execution-attestation.test.js`,
  `test/monitoring-attestation.test.js`, over the app-only
  `test/adapter-acceptance/receipt-crypto-vectors.v1.json`); and in **`receipt-verifier`** as
  signed token **bytes** cross-checked by two independent implementations, JS and Python, with
  12 of the 19 already under byte-identical ids (`EG-*` 5/5, `EG-A-*` 7/7). The 7 `MON-A-*` are
  staged into `receipt-verifier` separately.

  The removal could not start here — `cases.v1.json` is vendored from the app and gated
  byte-identical by its `test/conformance-cases-vendored-sync.test.js` — so it began at the
  app-canonical copy and this repo followed (`25c7e29`).

  **The profile is still one of the seven.** Its status moves `NOT RUN` → `NOT COVERED`
  (0 vectors), and `why_empty` states the retirement, the blocker, and both homes the vectors
  moved to. Deleting the row was refused: omission removes the evidence that the claim was ever
  contemplated, which is the same reasoning that made `0/0` unacceptable as a rendering.
  `--assurance RECEIPT_CRYPTO` still exits **3** — unproved here is not disproved.

- **`DECISION_LOGIC` gains the two `next_agent_step` vectors** the app added with the field
  (`AA-NEXT-STEP-NOT-PERMISSION`, `AA-NEXT-STEP-ALLOW-NULL`): 13 vectors → 15. They score that a
  consumer still branches on `execution_action` when the decision carries a remediation
  suggestion that reads more permissively than the verdict. They prove nothing about the
  signature over that step — that is `RECEIPT_CRYPTO`'s subject, and it does not run here.

- **The reference run is 16 cases** (was 14 + 23 unselected): `node bin/coderifts-conformance.js
  --subject reference` → `16 passed, 0 failed`.

### Added (since 0.3.0)

- **A RUNNING bypass suite for the attack matrix** — `COVERED` there means five points were
  executed, never declared (`ed1e177`).
- **`attack-matrix.v1` contract vectors** — replay / expired-nonce / payload-swap /
  missing-attestation recorded as *stated contract* (measured against guard 14 and the demo error
  codes); raw-tool / concurrent / stale-state as *pending contract*, needing a live executor and
  data plane. Recorded, not executed: `VECTOR_MAP` untouched, `excluded[]` still four,
  `ATOMIC_COMMIT` stays `NOT_COVERED` (`0c6537f`).
- **`vulnerable-bearer-executor.v1` as a pending expected-fail marker** —
  `CREDENTIAL_BOUNDARY` / `ATOMIC_COMMIT` stay `NOT_COVERED`. The bite cannot fire yet, so the
  marker records the missing surfaces rather than shipping a suite that is green on a vulnerable
  host (`7eb0997`).

### Fixed (since 0.3.0)

- **The capability-demo dependency is declared with a commit pin and named when absent**
  (`7ec404d`, roadmap 1201, from the 2026-08-30 audit).
- **`npm ci` works again**: the lockfile was regenerated for 0.3.0 (guard 14, sdk 3.10) after a
  version-only lock edit broke it — public reproducibility restored (`745cd71`).

### Release gate

- `npm run release:check` (`scripts/assert-changelog-version.js`) refuses a `package.json`
  version the CHANGELOG does not name as its own heading. Mirrored from
  `coderifts-contract-gate`, where three released versions (`v0.5.0`, `v0.6.0`, `v0.7.0`) went
  undocumented before the gate existed. Dependency-free on purpose: a release gate that needs an
  install to run is a gate that stops running.

## 0.3.0

Released before this file existed. See `bb478fc` (`chore(release): conformance 0.3.0` — EG2
grant v2 vectors + `ATOMIC_COMMIT` cases), `9a1fc62`, `f56c287`, `d117dea` (the seven assurance
profiles), `3c16419` and `bf88aa4` (LICENSE).
