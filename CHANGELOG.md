# Changelog

## Unreleased

## 0.8.8

The embedded 7/7 fixture is regenerated from prove 0.1.10, so the fixture's producer version matches the published prove (producer_version == published prove version, working tree clean). No behaviour change — the chain, the one grant, and the git-generated points[] are as in 0.8.7; this aligns the producer pin.


## 0.8.7

The --dir flag now reads the given directory (it was ignored, always verifying the embedded fixture); a nonexistent or incomplete directory is refused, an unknown argument is a usage error, and the output prints evidence_dir and source (embedded|external). The END_TO_END title, asserts, vector id and sidecar are generated from target_kind + provider_witness — no provider/deploy words when provider_witness is NOT_APPLICABLE. does_not_prove is generated from the same fields. The embedded transcript points[] are generated from the git E2E (no leftover DB prose; every grant id equals the issuance grant). Test isolation: fixture-mutating tests use their own temp copy. The vendored core is re-pinned to receipt-verifier v1.0.0. The negative result field is `measurement_completed` (did the vectors run) plus `claim_status` (is the claim proven); `result` and `status` remain as DEPRECATED aliases of `claim_status` for one release. Names measured against the emitted JSON, not against the sentence that was easier to write.


## 0.8.6

END_TO_END COVERED (7/7) on ONE grant end to end — the market-grade 7/7. One git grant flows through issuance, consume, the signed POINT 6 attestation, and the POINT 8 transition (the earlier two-grant fixture path is closed; the closed profile TRUSTED_EXECUTOR_INTEGRITY_V1 reads COVERED, and reads COMMIT_UNPROVEN on a two-grant capture). Ships VERIFY.md + a proof/ folder a stranger can replay: the one-grant fixture and two negatives (two-grant, tampered-attestation) that must be refused; a --dir flag so the CLI verifies the visible proof folder, not the embedded fixture. Honest boundary: trusted-executor-integrity, RECORDED, not externally witnessed, not PATH B.


## 0.8.5

END_TO_END reads COVERED (7/7): the vendored fixture now carries a real bare-Git target-state transition. POINT 8 is TARGET_STATE_TRANSITION_PROVEN — a governed ref moved to the authorized commit under a signed grant, and a separate read-only process observed it afterwards (proof_scope TRUSTED_EXECUTOR, provider_witness NOT_APPLICABLE, externally_witnessed false). Vendoring the real capture also uncovered and fixed two defects the old PARTIAL fixture had masked: the four transition correlations are now a conjunct of the verdict (a named gap that did not move the grade), and the AUDITOR-1 mutation control is a byte-level flip (the char-level flip was a no-op when a signature's last base64url char decodes its low bits to nothing). No negative control weakened. This is trusted-executor-integrity, not a provider merge (PATH B) and not externally witnessed.


## 0.8.4

Vendors the shared verified-execution-binding core (the authorization verdict alongside the coverage facts) and the receipt-binding + v1-ATOMIC fixes, with per-file git-show pins. END_TO_END stays PARTIAL (6/7): the vendored fixture carries no cr.evidence.root.v1, so cross_run_collage is a named gap — an honest 6/7, not a claimed 7/7. The 7/7 requires a fresh root-bearing capture (a later release).


## 0.8.3

The measure now AUTHENTICATES every signed token, not only the pin (P0.1, 1423). A second auditor
showed the gap on 0.8.2: flip the last character of `issuance.execution_grant` or of
`transcript_token`, recompute the pin, and END_TO_END still graded **COVERED**. Both mutations were
reproduced against 0.8.2 — including against the tarball fetched from the registry — before
anything was changed.

The pin and the signatures answer different questions. The pin says "these are the bytes we
vendored"; only a signature says "the named issuer produced them". Whoever can edit the vendored
bytes can also edit the file the hash lives in, so a pin alone is a check against accident, not
against an editor. 0.8.2 verified the pin and exactly ONE signature (the correlation's).

`measureContractE2E` now calls a canonical evidence verifier — receipt-verifier's shared core,
vendored under `lib/vendor/receipt-verifier/` with a `VENDOR.sha256` pin — which authenticates the
execution grant, the chain receipt, the prove transcript token and the correlation, each against
its own issuer's key. A token whose signature does not verify is a NAMED gap ("the execution_grant
signature does not verify") and the profile drops to **PARTIAL**. An ABSENT required token is a gap
too: deletion is the strongest tamper there is and must never read as a pass.

Why a shared core rather than more checks here: the real shape of the bug was two verifiers
disagreeing. capability-demo's `prove --check` refused both of the auditor's mutations while this
measure accepted them — and, measured the other way, `prove --check` was the one that skipped the
correlation signature. Complementary blind spots, each reading as thorough on its own.

Also in this release: a 37-case mutation matrix (every signed token, every correlation binding
field, the keyring, the continuity identities, provenance and the structural claims), each case
recomputing the pin so a green result could only ever mean the signature check stopped it; and
`scripts/check-packed-install.js`, which installs the built tarball and re-runs the measure from
the INSTALLED package — 0.8.2 shipped a measure that graded a mutation COVERED and every test in
the repo passed, because the tests read the working tree and a working tree is not the artifact.

Two overclaims found by the matrix and corrected: the profile printed "one run_id across N points"
while the points carry no run_id at all (a spliced point naming another run was invisible), and the
continuity block's own `issued_jti` was not load-bearing, so it could disagree with the issuance
in silence.

HONEST BOUNDARY (unchanged): this strengthens the 7/7 — the measure now authenticates rather than
only pinning — and does not change what END_TO_END claims. It is still the target-state-transition E2E,
witness-attested and not provider-signed, and '7/7' does NOT mean CodeRifts merged a PR.


## 0.8.2

END_TO_END is COVERED — the suite is 7/7 (2 LIVE + 5 RECORDED). The vendored end-to-end capture is
a single authorization-continuous run: one server-issued v2 ATOMIC grant flows through authorize,
consume, attestation and correlation (issued_jti === consumed_jti === attestation_jti,
issued_scope_hash === correlation_scope_hash), captured on a clean commit (git:a39a407,
working_tree_dirty false), with a negative pole (same producer, different readback commit). This is
the authorization-continuity an auditor requires: the SAME grant end to end, not two grants placed
in one transcript. measureContractE2E re-verifies the grant-identity from the vendored bytes and
returns COVERED / RECORDED. HONEST BOUNDARY (unchanged, in the profile's last does_not_prove line):
this is the target-state-transition E2E — witness-attested, not provider-signed; the v2 ATOMIC grant is
non-replayable (the nonce preimage exists nowhere); '7/7' does NOT mean CodeRifts merged a PR (that
is PATH B).


## 0.8.1

Warrants a PATCH: the observed merge-API 405 (PR#4 failing + PR#5 expected) is
wired into the **PROVIDER_ENFORCED evidence-envelope**, so the published package
contains those bodies (they landed in git after the `conformance-v0.8.0` tag)
and the provider-blocking proof is on the profile, not a side artifact.
`evidence_tier` stays **RECORDED**. COVERED now requires the check poles **and**
the 405 pair. `does_not_prove` stays honest (HISTORICAL, local gh not OIDC,
PR#5 405 is `expected` / BEHIND, no merge landed). Not a live 405 canary.

### Changed — 405 is PROVIDER_ENFORCED envelope evidence (1395)

Admin `PUT …/pulls/{4,5}/merge` HTTP 405 bodies (`fixtures/recorded/bypass-attempt/`,
pin `cr.conformance.recorded-pin.v1`) are attached to the PROVIDER_ENFORCED
envelope: PR#4 `CodeRifts / contract-gate is failing` (negative), PR#5
`… is expected` (positive control). The gate not only failed the required check
on PR#4 (`FAILURE` + `BLOCKED`) but refused the admin merge. Still HISTORICAL +
local-gh. Not an eighth profile. Not OIDC.

### Also in this HEAD (already in 1a556b7, not in 0.8.0)

- PROVIDER_ENFORCED negative pole re-pinned from PR#10 (`CodeRifts — API Contract
  Check` FAILURE, BEHIND) to PR#4 (required `CodeRifts / contract-gate` FAILURE,
  merge BLOCKED). Positive pole remains PR#5 required-context SUCCESS.
- Vector-count fields document their units: `vectors_present` is unique vectors;
  `vectors_positive` / `vectors_negative` are polarity occurrences (a `pair` vector
  counts in both). present need not equal pos+neg.
- Prove-transcript re-vendored from a clean capability-demo checkout of `3a34079`
  (`working_tree_dirty:false`, run `prove-fb5c23bd-…`). COVERED status unchanged.

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
