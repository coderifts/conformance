# VERIFY — replay the 7/7 on your own machine

Three commands. Two must pass, and two captures must be REFUSED. If the refusals do not happen,
the passes mean nothing.

Nothing here contacts a network. Every command reads bytes that ship with the package.

## What this proves, and what it does not

```
proof_scope           TRUSTED_EXECUTOR
provider_witness      NOT_APPLICABLE
externally_witnessed  false
evidence              RECORDED (a pinned capture, replayed — not a live run)
```

One authorization (`git.ref.update` on a bare Git ref) was issued by the server, consumed in a
ledger claim made in the same transaction as the compare-and-swap, sealed by the executor, and
then read back by a SEPARATE PROCESS that cannot write and was never told what it would find.

The executor and the observer are one machine and one OS user, separated by the target's mode
bits. **No pull request was merged and no provider witnessed anything.** A reader who takes this
for a GitHub merge has been misled — that is a different claim, and this is not evidence for it.

---

## 1 · The full verify (Node) — signatures included

```
npx @coderifts/conformance --assurance END_TO_END
```

```
END_TO_END: COVERED / RECORDED — 2 vector(s)
```
exit **0**

This is the one that decides. It checks every signature (the issuer's grant, the executor's
attestation, the transcript, the correlation), re-derives the four target-state correlations
offline, verifies the `cr.evidence.root.v1` binding every token's digest to one `run_id`, and
requires the closed profile `TRUSTED_EXECUTOR_INTEGRITY_V1` — whose authority set the caller
cannot shorten.

## 2 · The cross-language check (Python) — digests, no signatures

```
python -m coderifts.verify <path-to>/fixtures/recorded/end-to-end \
  --payload <path-to>/proof/authorized-payload.yaml
```

```
  grant     886a6a5a-… (git.ref.update on git://atomic-v2-reference/repo.git/refs/heads/main)

  ok      receipt_digest(chain_receipt) == grant.receipt_hash
  payload   535 bytes -> sha256:3475e74d2656e43b32526af7e90ddab7fef292cd38cbbf4f8365c57d50ffd55d
  ok      sha256(payload) == grant.after_payload_hash
  ok      sha256(payload) == correlation.scope_hash
  ok      sha256(payload) == evidence_root.scope_hash
  ok      sha256(payload) == observation.contract_blob_digest

  issuance           886a6a5a-…
  consume (ledger)   886a6a5a-…
  transition         886a6a5a-…
  attestation        886a6a5a-…
  ok      ONE grant id across issuance, consume, attestation and transition

  RESULT    MATCH (exit 0)
```
exit **0**

This command reads **no signature**: it re-derives digests and compares them. The base
`pip install coderifts-sdk` is requests-only, and the `[verify]` extra
(`pip install 'coderifts-sdk[verify]'`) adds full local Ed25519 (`coderifts.verify_receipt`) — so the limit below belongs to THIS COMMAND,
not to the package. The earlier wording said the package "carries no Ed25519", which the `[verify]`
extra made false while the command's own limit never changed. What this proves is that a second
implementation, in another language, computes the same digests from the same
bytes — the capture's hash recipes are reproducible, and it is not Node-only. **It verifies no
signature.** A capture whose every signature was forged would pass this and fail command 1.

## 3 · The refusals — the gate is not a rubber stamp

```
npx @coderifts/conformance --assurance END_TO_END --dir <path-to>/proof/negatives/two-grant
npx @coderifts/conformance --assurance END_TO_END --dir <path-to>/proof/negatives/tampered-attestation
```

Both print, **on stderr** (a refusal goes to the stream a pipeline treats as the problem — pipe
stdout only and you will see nothing):

```
evidence_dir: /abs/path/to/proof/negatives/two-grant
source: external
END_TO_END: PARTIAL / RECORDED — this suite does not prove this claim.
  the vendored run is not correlated — see gaps; a fixture that cannot be re-verified is not evidence
```
exit **3** — *unproved*, which in this package is deliberately not the same as *disproved* (exit 1).
`END_TO_END: COVERED` on command 1 goes to stdout, with its own `evidence_dir` / `source` lines.

**`evidence_dir` and `source` are printed on every run**, and reading them is the point. A verdict
that does not name the bytes it graded is a verdict about a capture you have to assume: `--dir` was
IGNORED for a whole release, so `--dir /nonexistent` printed `COVERED, exit 0` about the embedded
fixture. Check that `evidence_dir` is the directory you meant. A path that does not exist, or one
missing any of `transcript.json`, `readback.json`, `executor-keys.json`, `pin.json`, is REFUSED —
it never falls back to the embedded capture.

An unrecognised argument is a usage error (exit 2), not a shrug. `--potato` used to be ignored.

**`two-grant`** is a REAL earlier capture of the same producer, from before one grant carried the
whole chain. Every signature in it verifies; nothing is forged. It is refused because
`the attestation binds a different grant id than the verified grant` — the chain ran on two
authorizations. (It also trips two later checks it predates; `proof/README.md` names all three and
which one this negative is for.)

**`tampered-attestation`** is the passing capture with ONE BIT of the executor attestation's
signature flipped and the pin recomputed, as an editor of vendored bytes would.

> Run command 2 against `proof/negatives/tampered-attestation` and it **passes, exit 0**. That is
> not a bug and it is the point: Python checks digests, and a flipped signature does not change a
> digest it never reads. The Node verify catches it. This is what each command is worth, shown
> rather than asserted.

---

## Where the bytes are

| | |
| --- | --- |
| the capture | `fixtures/recorded/end-to-end/` |
| what the grant authorized | `proof/authorized-payload.yaml`, described in `proof/README.md` |
| the refusals | `proof/negatives/` |
| the format specs | `receipt-verifier/RECEIPT_FORMAT.md` §10–13 |

The capture is pinned: `pin.json` records the sha256 of every file, and the measure refuses bytes
that do not match it before reading them as evidence. Editing a byte and recomputing the pin does
not help — that is exactly what `negatives/tampered-attestation` does.
