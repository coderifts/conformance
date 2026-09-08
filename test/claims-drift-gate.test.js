'use strict';

/**
 * THE CLAIMS DRIFT-GATE — marketing may know the future; the verifier asserts only the present.
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ────────────────────────────────────────────────────────
 *
 * Not a forged signature. A SENTENCE. Someone writes "tool-call binding: enforced" in a README
 * because a `call_hash` field was reserved, and a reader — reasonably — takes the package's own
 * word for what the package does. Nothing is tampered with, every test passes, and the claim is
 * false. That is the cheapest over-claim there is, and the only thing that stops it is a check
 * that reads the prose against the code.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────────────────
 *
 * A capability may be described as DONE only if a NEGATIVE FIXTURE proves its absence is refused.
 * If the text says a capability gates a run, and nothing in the shipped bytes refuses a capture
 * that lacks it, the text is ahead of the code and this fails.
 *
 * Anything else may still be written about — as roadmap, planned, or on-request. What it may not
 * be called is available, done, enforced, or supported.
 *
 * ── WHY A WORD LIST IS NOT SILLY HERE ───────────────────────────────────────────────────────
 *
 * It cannot catch every phrasing, and it does not claim to. It catches the specific pairing that
 * ships: a NOT-DONE capability sitting in the same sentence as a done-word. A reviewer reading a
 * diff sees "we support executor-image pinning" and has to remember which of five roadmap items
 * are real; this file remembers for them.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * The done set, TODAY. Each entry names the negative fixture or check that refuses its absence —
 * because "we can list it" is not the bar; "a capture without it is refused" is.
 */
const DONE = Object.freeze([
  { name: 'issuer grant', proof: 'authorization: issuer_grant refuses an unverifiable grant' },
  { name: 'consume', proof: 'negatives/two-grant: the attestation binds a different grant id' },
  { name: 'target-state transition', proof: 'transition after_state_token / single_parent / no_unauthorized_company' },
  { name: 'offline verify', proof: 'negatives/tampered-attestation: ATTEST_INVALID_SIGNATURE' },
]);

/**
 * NOT done. Reserved, planned, or absent — and every one of them is a phrase a reader could
 * mistake for a feature if it appeared beside a done-word.
 */
const NOT_DONE = Object.freeze([
  { id: 'call_hash', patterns: [/call[_ -]?hash/i, /tool[- ]call binding/i] },
  { id: 'executor_image_digest', patterns: [/executor[_ -]?image[_ -]?digest/i, /image pinning/i] },
  { id: 'bundle', patterns: [/\bbundle (gate|verification|enforcement)\b/i] },
  { id: 'delegation', patterns: [/\bdelegation\b/i, /\bdelegated (grant|authority)\b/i] },
  { id: 'external witness', patterns: [/external(ly)?[- ]witness(ed|ing)?\b/i, /provider[- ]witness(ed)?\b/i] },
]);

/** Words that assert a capability EXISTS NOW. */
const DONE_WORDS = /\b(available|done|enforced|enforces|enforcing|supported|supports|shipped|ships|implemented|in production|GA|generally available)\b/i;

/** Words that mark a capability as NOT yet real. A sentence carrying one is exempt. */
const FUTURE_WORDS = /\b(roadmap|planned|future|reserved|on request|on-request|not (yet )?(shipped|built|implemented|enforced|available)|inert|deferred|would|will be|no signed-witness format|NOT APPLICABLE|not applicable)\b/i;

/** Every text file the PACKAGE ships — a doc nobody installs cannot mislead an installer. */
function shippedTexts() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const out = [];
  const add = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      for (const child of fs.readdirSync(abs)) add(path.join(rel, child));
      return;
    }
    if (/\.(md|txt)$/i.test(rel)) out.push({ rel, text: fs.readFileSync(abs, 'utf8') });
  };
  for (const entry of pkg.files) add(entry.replace(/\/$/, ''));
  return out;
}

/** Sentence-ish units. Claims live in sentences; a whole file is too coarse to judge. */
const sentences = (text) => text
  .split('\n')
  .flatMap((line) => line.split(/(?<=[.!?])\s+/))
  .map((s) => s.trim())
  .filter(Boolean);

describe('the shipped text does not call a NOT-DONE capability done', () => {
  const texts = shippedTexts();

  it('there is shipped text to check at all', () => {
    // A gate that silently found no files would pass forever.
    assert.ok(texts.length >= 3, `only ${texts.length} shipped text file(s) found`);
    assert.ok(texts.some((t) => t.rel === 'README.md'));
    assert.ok(texts.some((t) => t.rel === 'VERIFY.md'));
  });

  for (const cap of NOT_DONE) {
    it(`${cap.id} is never described as available/done/enforced`, () => {
      const offenders = [];
      for (const { rel, text } of texts) {
        for (const s of sentences(text)) {
          if (!cap.patterns.some((p) => p.test(s))) continue;
          if (!DONE_WORDS.test(s)) continue;
          // A sentence that ALSO marks it as future is the honest shape, and is what we want
          // people to write. "…is not yet enforced", "reserved for a future gate", "planned".
          if (FUTURE_WORDS.test(s)) continue;
          offenders.push(`${rel}: ${s.slice(0, 160)}`);
        }
      }
      assert.deepEqual(offenders, [],
        `${cap.id} is NOT done — no negative fixture refuses its absence — yet the shipped text `
        + `asserts it:\n${offenders.join('\n')}`);
    });
  }
});

describe('the DONE set is exactly what a negative fixture refuses', () => {
  it('each done capability names the refusal that proves it', () => {
    // Not decoration. If a capability is listed here with no refusal behind it, the list itself
    // becomes the over-claim — one level up from the README.
    for (const d of DONE) {
      assert.ok(d.proof && d.proof.length > 10, `${d.name} claims done with no refusal named`);
    }
  });

  it('the two negative captures are SHIPPED and are actually refused', () => {
    const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');
    for (const name of ['two-grant', 'tampered-attestation']) {
      const dir = path.join(ROOT, 'proof', 'negatives', name);
      assert.ok(fs.existsSync(path.join(dir, 'transcript.json')), `${name} is not shipped`);
      const r = measureContractE2E({ dir });
      assert.notEqual(r.coverage, 'COVERED', `${name} is NOT refused — the done set is unproven`);
    }
  });

  it('the positive capture is COVERED — the refusals are not a blanket no', () => {
    const { measureContractE2E } = require('../lib/recorded-contract-e2e.js');
    assert.equal(measureContractE2E().coverage, 'COVERED');
  });
});

describe('the reserved fields are described as reserved wherever they are mentioned', () => {
  it('any mention of call_hash or executor_image_digest carries a not-yet marker', () => {
    // The reserved names WILL appear in text as the roadmap is written down. When they do, the
    // sentence has to say what they are — otherwise a reader meets a field name in a spec and
    // assumes the spec describes behaviour.
    const offenders = [];
    for (const { rel, text } of shippedTexts()) {
      for (const s of sentences(text)) {
        if (!/call[_ -]?hash|executor[_ -]?image[_ -]?digest/i.test(s)) continue;
        if (FUTURE_WORDS.test(s) || /\bnot\b/i.test(s) || /\bno\b/i.test(s)) continue;
        offenders.push(`${rel}: ${s.slice(0, 160)}`);
      }
    }
    assert.deepEqual(offenders, [],
      `a reserved field is mentioned without saying it is reserved/inert:\n${offenders.join('\n')}`);
  });
});
