# Adapter acceptance suite — contract (v1)

Language-agnostic cases for **every consumer of a CodeRifts decision**.  
Not a second interpretation of branching: cases are **data**; adapters supply a **subject**.

## Why JSON + this contract

A Python SDK and a TypeScript SDK must run the **same** case file without hand-translating scenarios. A translated copy is a second interpretation — the failure mode this suite exists to stop.

| Piece | Role |
|--------|------|
| `cases.v1.json` | Single case source (ids, inputs, expects, `source` anchors) |
| This file | How to implement a subject and score results |
| `run.js` (optional Node) | Reference runner in this repo |

## Subject interface

A subject is a pure function of one case input. No network. No API keys.

```text
subject(case) → result
```

### `kind: "decide"`

**Input** (`case.input`):

```json
{
  "response": {
    "decision": "ALLOW|WARN|REQUIRE_APPROVAL|BLOCK",
    "safe_for_agent": true,
    "execution_action": "CONTINUE|CONTINUE_WITH_MONITORING|REQUEST_APPROVAL|STOP|<other string>"
  },
  "host": { "monitoringSinkWired": true|false }
}
```

**Result** (subject must return):

```json
{
  "outcome": "proceed|proceed_with_monitoring|request_approval|halt",
  "declared_strictnesses": ["optional_conjunct_name"]
}
```

`declared_strictnesses` is optional. Required only when the subject **deviates** from the
floor on a **liveness** case in the **stop direction** (see Scoring).

**Normative mapping** (from `/.well-known/coderifts.json` → `recommended_usage`):

| Condition | `outcome` |
|-----------|-----------|
| `execution_action === "CONTINUE"` | `proceed` |
| `execution_action === "CONTINUE_WITH_MONITORING"` and `host.monitoringSinkWired === true` | `proceed_with_monitoring` |
| `execution_action === "CONTINUE_WITH_MONITORING"` and sink not wired | `halt` |
| `execution_action === "REQUEST_APPROVAL"` | `request_approval` |
| `execution_action === "STOP"` | `halt` |
| any other `execution_action` (unrecognised) | `halt` |

**Must not:** map from `decision` or `safe_for_agent` instead of `execution_action`.  
Cases deliberately set those fields so a decision-only brancher fails.

### `kind: "tool_selection"`

**Input** (`case.input`):

```json
{
  "situation": "<string id from the case>",
  "change": { ... },
  "held_receipt": null | { "token": "...", "operation": "...", "target_id": "..." },
  "intended": { "operation": "...", "target_id": "..." }
}
```

**Result:**

```json
{ "tool": "preflight_change_set"|"verify_receipt"|"get_decision_details"|null }
```

`null` means call **no** CodeRifts tool (docs-only / skip).

Normative selection is pinned in each case’s `expect.tool` and anchored to shipped tool description text (see `source`).

## Case class: safety vs liveness (one profile, two classes)

Every case has `"class": "safety" | "liveness"`. **Not** a second profile.

| Class | Floor meaning | Deviation |
|-------|---------------|-----------|
| **safety** | MUST NOT execute (expect `halt` / `request_approval`, or tool `null` when docs-only) | **Zero deviation.** Declarations cannot excuse. |
| **liveness** | Floor says execute (`proceed` / `proceed_with_monitoring` / call a tool) | Adapter **MAY** halt (stop-direction only) **if** it declares and demonstrates an extra conjunct |

Stop-direction (decide): `halt` / `request_approval` is stricter than `proceed` /
`proceed_with_monitoring`. Proceeding when the floor says halt is **never** declarable.

## Scoring

1. Call `subject(case)` for every case in the run (needed for demonstration cross-checks).
2. If `result` matches `case.expect` on named keys → case **passes** (floor match).
3. If not:
   - **safety** → **fail** (always).
   - **liveness** + not stop-direction → **fail**.
   - **liveness** + stop-direction + no `declared_strictnesses` → **fail**.
   - **liveness** + stop-direction + declarations → each named conjunct must be:
     - listed on `case.strictness_allowed[].conjunct`
     - **present** on this case (`present_when` holds on `case.input`)
     - **demonstrated absent** on `absence_case_id` (that case must **floor-pass**)
     - undemonstrated declaration → **fail**
4. Suite **passes** iff every case passes. Result is not only binary: reporters should
   print `declared_strictnesses` accumulated from the run (visible cost of strictness).

### Declaration format (machine-readable, not prose)

On the subject result when excusing a liveness stop:

```json
{ "outcome": "halt", "declared_strictnesses": ["safe_for_agent_false"] }
```

On the case (suite data):

```json
"strictness_allowed": [{
  "conjunct": "safe_for_agent_false",
  "present_when": { "response.safe_for_agent": false },
  "absence_case_id": "AA-BRANCH-CONTINUE"
}]
```

An undemonstrated declaration is a fail. “Halts on Tuesdays” is not declarable:
conjuncts are concrete names bound to `present_when` paths on the case input.

### Structural limits (anti–declaration-hoarding)

1. **Stop-direction only** — cannot declare a way to *proceed* on a safety floor.
2. **Liveness cases only** — safety cases reject all declarations.
3. **Named concrete conjunct** — must appear on `strictness_allowed` for that case.
4. **Declarations are part of the result** — accumulation is visible suite cost.
5. **Present-when bound to case input** — the suite checks the conjunct is actually
   present on the fixture (and absent on `absence_case_id`); free labels without
   input binding fail.

## Derivation / drift guard

Every case has `source.surface` + `source.path` (or `source.marker`).  
Runners in this repo assert those anchors still hold on the live shipped modules. If well-known or tool text changes, the suite fails until cases are deliberately updated.

## Profiles

| Profile | Meaning |
|---------|---------|
| `normative` | All cases; pure consumer branching (well-known + tool DESC) |
| `enforcement_consistent` | Subset: `decide` cases with consistent decision↔action only (for guards that fail-closed on inconsistency) |

`cases.v1.json` marks each case with `"profiles": ["normative"]` and optionally `"enforcement_consistent"`.  
**Do not** add a second profile for “stricter adapters” — use liveness declarations.

## Out of scope

- Server MCP transport (see `test/mcp-conformance/`)
- Writing new adapters
- Network preflight
