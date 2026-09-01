# Changelog

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
