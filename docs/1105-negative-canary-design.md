# 1105 — the negative canary: design and cost, NOT built

Configuration read-back proves the configuration. It does not prove the provider refuses. This
document measures what a canary would cost and what it would prove, so the decision to build it is
made on numbers rather than on the appeal of the idea. **Nothing here is implemented.**

## The shape

An ephemeral branch and a pull request on which our check is deliberately missing or failing; a
merge attempt; the provider must refuse; then a rule-suite read-back and cleanup.

The refusal signal is measured, not assumed: `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`
(`pulls/merge`) documents **`405 — Method Not Allowed if merge cannot be performed`**. A canary
passes on 405 and fails on 200. Nothing weaker counts: a 403 is a permission answer and a 422 is a
request-shape answer, and neither says the branch was protected.

## Cost, measured

| Cost | Measured value | Notes |
|---|---|---|
| Pull-request number | **1 burned, permanently** | PR and issue numbers share one monotonic counter per repository. It cannot be reclaimed, and the gap is visible in the sequence forever. |
| Workflow runs | **every workflow with an `on: pull_request` trigger** | Measured on our own repositories: 1 each. An adopter's number is theirs, and our own contract-gate template forbids `paths:` filters precisely so the gate cannot be skipped — which means it cannot be skipped by a canary either. |
| Notifications | every watcher, plus any CODEOWNER the paths touch | A repository with review requirements will also request reviews. |
| Check runs | one per required check, including ours | The canary deliberately makes ours missing or failing, which is a red check in the repository's history. |
| Residue after cleanup | **the PR number, the closed PR, its check history, and the workflow-run log** | Deleting the branch removes the ref. It does not remove the PR, its number, its conversation or its runs. |
| Rule-suite read-back | `GET /repos/{owner}/{repo}/rulesets/rule-suites` (`repos/get-repo-rule-suites`) | **Requires authentication** — measured 2026-08-27: HTTP 401 unauthenticated even on a public repository. Unlike `GET /rulesets`, this cannot be done credential-free. |

## Can it avoid the customer's default branch? Measured: NO, not without going blind

The tempting design is an ephemeral base branch, so nothing touches `main`. Measured against the
ruleset condition semantics (`conditions.ref_name.include` / `.exclude`, with `~DEFAULT_BRANCH` and
`~ALL` as documented tokens): a ruleset that targets the default branch **does not apply** to an
ephemeral base. The merge would succeed, the canary would report "the provider did not refuse", and
the correct reading of that result is *nothing at all* — the rule was never in scope.

So the canary must target the ref the ruleset actually protects. Where that is `~ALL`, an ephemeral
base works. Where it is `~DEFAULT_BRANCH` or `refs/heads/main` — which is the common case, and the
case our own installer writes — the canary must open against the default branch. A canary that
quietly used an ephemeral base would be a **green light that means nothing**, which is worse than
no canary.

## Judgement: OPT-IN AT INSTALL TIME, never routine

Routine is wrong on the numbers above. A canary on every CI run burns a PR number per run, triggers
every `pull_request` workflow, and writes a failing check into the repository's history on purpose.
Within a month the PR sequence of an active repository is visibly pocked with them, and the
repository's own check history contains deliberate red that a human auditor must be told to ignore.

The honest shape is a one-shot, explicitly consented action at install time — the same posture
`setup-required-check` already takes, where the CLI defaults to dry-run and writes only on
`--apply`. Consent must name the cost in the prompt: *this opens a real pull request, burns a
number, runs your CI, and leaves a closed PR behind.*

Two consequences follow, and both should be stated wherever the result is shown:
- It is **one observation**, not a subscription. It has an `observed_at` and it should carry an
  `expires_at`, exactly as `enforce --check` evidence now does.
- It should be **re-runnable on demand**, because the thing it measures changes without warning.

## What a passing canary proves — and what it does not

**Proves:** at one moment, on one repository, on one ref, the provider refused a merge that lacked
our check. That is a fact about provider behaviour, which no amount of configuration reading can
establish, and it is the only evidence that would move `PROVIDER_ENFORCED` out of NOT_COVERED.

**Does not prove:**
- **That it still holds.** It is an observation, not a standing property. A bypass actor added
  tomorrow, an enforcement flipped to `evaluate`, a ruleset retargeted away from the branch — any
  of these makes yesterday's canary silently obsolete. The canary cannot notice; it has already
  finished.
- **That the refusal was ours.** The provider refused *a* merge. A different required check may
  have been the one that blocked. Attributing the refusal to our gate needs the check-run detail
  (`app`, `head_sha`, `conclusion`), which is the per-run class this suite does not read.
- **Anything about other refs.** A canary on the default branch says nothing about release branches
  under a different ruleset.
- **Anything about actors who can bypass.** `bypass_actors` was measured absent from every
  unauthenticated ruleset response; an admin with bypass merges past a gate that refused the canary.

## The ceiling still applies

A passing canary proves ONE NAMED SHAPE fails at the recorded version, never that the class is
closed. Read as a standing guarantee it would be the most over-read artefact this suite could
produce, because a live provider refusal *feels* like proof in a way a JSON comparison does not.
