# proof/ — what a stranger checks

The capture this folder is about lives in `../fixtures/recorded/end-to-end/`. It is not copied
here: two sets of the same bytes drift, and the one the CLI grades is the one that must be read.

## What the grant authorized

| | |
| --- | --- |
| operation | `git.ref.update` |
| target | `git://atomic-v2-reference/repo.git/refs/heads/main` |
| expected state (BASE) | the commit the ref was at when the grant was issued |
| authorized bytes | `authorized-payload.yaml` — sha256 `3475e74d2656e43b…` |
| before | `before-payload.yaml` — the committed contract the change starts from |

`authorized-payload.yaml` is the AFTER side of the governed change. The grant binds its digest
(`after_payload_hash`), not the bytes, so the bytes travel here — a digest shipped twice would
prove nothing, and without them nobody outside can recompute the value.

The change itself is one line of an OpenAPI description. That is deliberate: what is being shown
is WHICH BYTES were authorized and written, not how dramatic the diff was.

## The honest ceiling

`proof_scope: TRUSTED_EXECUTOR` · `provider_witness: NOT_APPLICABLE` · `externally_witnessed: false`

The executor and the observer are one machine and one OS user, separated by the target's mode
bits — not by two identities and not by a third party. **No pull request was merged and no
provider witnessed anything.** The evidence is RECORDED and replayed, not live.

## negatives/ — captures that MUST be refused

A gate that has only ever seen the passing case cannot be shown to do anything.

### `negatives/two-grant/`

A REAL earlier capture of this same producer (conformance `747cfd1`), from before one grant carried
the whole chain. Its issuance grant authorized a database write; its attestation sealed a git ref
update. Nothing is forged — every signature in it verifies.

Refused for three reasons, and all three are stated because only one of them is what this negative
is FOR:

1. `authorization: executor_attestation: the attestation binds a different grant id than the
   verified grant` — **this is the two-grant defect.**
2. `transition no_unauthorized_company: the observation reports no changed_paths` — this capture
   predates that check. A fact about its age, not about the defect.
3. `transition self_consistent: … re-derive CARRIED_UNVERIFIED` — a consequence of (2).

It would still be refused for (1) alone.

### `negatives/tampered-attestation/`

The current capture with ONE BIT of the executor attestation's signature flipped, and the pin
recomputed — as an editor of vendored bytes would. The flip is verified to change the decoded
signature bytes before it is written; a mutation that might be a no-op is not a control.

**This one is refused by the Node verify and PASSES the Python one, on purpose.** The Python entry
computes digests and carries no Ed25519, so a broken signature is invisible to it. That is the
clearest statement of what each verify is worth, and it is why `VERIFY.md` runs both.
