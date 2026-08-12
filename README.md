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

```bash
node bin/coderifts-conformance.js --subject reference
node bin/coderifts-conformance.js --subject sdk
node bin/coderifts-conformance.js --subject agent-guard
node bin/coderifts-conformance.js --subject agent-guard --profile enforcement_consistent
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

## Case source of truth

`cases.v1.json` is **vendored** from the private CodeRifts app (`test/adapter-acceptance/cases.v1.json`). The app CI asserts byte-identity so this public copy cannot silently drift from what the product tests against.

App-private anchor checks (that cases still match live app source text) stay **out of this package** — they require the private app tree.

## License

MIT
