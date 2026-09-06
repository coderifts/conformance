'use strict';

/**
 * THE MUTATION MATRIX — one byte, every signed token and every binding field.
 *
 * ── WHY THIS EXISTS (1423) ──────────────────────────────────────────────────────────────────
 *
 * The measure checked the PIN and one signature. An auditor flipped the last character of
 * `issuance.execution_grant`, recomputed the pin, and the profile still graded COVERED — and the
 * same for `transcript_token`. Both are named cases below, and both were REPRODUCED against the
 * old code before it was changed.
 *
 * ── WHY EVERY CASE RECOMPUTES THE PIN ───────────────────────────────────────────────────────
 *
 * Because an attacker would. A mutation that leaves the pin stale is caught by arithmetic nobody
 * had to think about; the interesting adversary edits the bytes AND the hash beside them, which is
 * exactly what a vendored-fixture attacker can do. Every case here does that, so a green result
 * would mean the signature check is what stopped it — not the pin.
 *
 * ── WHAT A CASE ASSERTS ─────────────────────────────────────────────────────────────────────
 *
 * Fail-CLOSED, and for the RIGHT reason. `expect` is a substring the measure must name, so a case
 * cannot pass because some unrelated check happened to break: mutating a correlation field must be
 * refused as a correlation problem, not as a stale readback.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { measureContractE2E, FIXTURE_DIR } = require('../lib/recorded-contract-e2e.js');

const ARTIFACTS = ['transcript.json', 'executor-keys.json', 'readback.json',
  'negative-transcript.json', 'negative-readback.json', 'pin.json'];

/** Flip the LAST character to a different one of the same alphabet. One byte, nothing else. */
function flipLast(s) {
  const last = s[s.length - 1];
  const alt = last === 'A' ? 'B' : 'A';
  return s.slice(0, -1) + alt;
}

/** Flip one character in the middle of a base64url segment. */
function flipMid(s) {
  const i = Math.floor(s.length / 2);
  const alt = s[i] === 'A' ? 'B' : 'A';
  return s.slice(0, i) + alt + s.slice(i + 1);
}

/** Mutate segment `n` of a pipe- or dot-delimited token. */
function flipSegment(token, sep, n) {
  const seg = token.split(sep);
  seg[n] = flipMid(seg[n]);
  return seg.join(sep);
}

/**
 * Copy the fixture set, apply the mutation, RECOMPUTE THE PIN, run the real measure.
 * The pin recompute is the point: it removes the hash as an explanation for any refusal.
 */
function measureMutated(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-mut-'));
  try {
    for (const f of ARTIFACTS) fs.copyFileSync(path.join(FIXTURE_DIR, f), path.join(dir, f));
    const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const write = (f, d) => fs.writeFileSync(path.join(dir, f), JSON.stringify(d, null, 2));
    mutate({ read, write, dir });

    const pin = read('pin.json');
    for (const a of pin.artifacts) {
      const abs = path.join(dir, a.path);
      if (!fs.existsSync(abs)) continue;
      const b = fs.readFileSync(abs);
      a.sha256 = crypto.createHash('sha256').update(b).digest('hex');
      a.bytes = b.length;
    }
    write('pin.json', pin);

    try {
      return measureContractE2E({ dir });
    } catch (err) {
      // assertPins throwing IS fail-closed. Report it as a refusal with its message so a case
      // that expects a named reason can still match one.
      return { coverage: 'PARTIAL', green: false, missing: [`pin refused: ${err.message}`] };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** [name, mutate, expected substring of a `missing` entry] */
const CASES = [
  // ── THE AUDITOR'S TWO, BY NAME. Both graded COVERED before this round. ────────────────────
  ['AUDITOR-1: execution_grant last character + pin recompute',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.execution_grant = flipLast(t.issuance.execution_grant); write('transcript.json', t); },
    'execution_grant signature does not verify'],
  ['AUDITOR-2: transcript_token last character + pin recompute',
    ({ read, write }) => { const t = read('transcript.json'); t.transcript_token = flipLast(t.transcript_token); write('transcript.json', t); },
    'transcript_token signature does not verify'],

  // ── execution_grant ───────────────────────────────────────────────────────────────────────
  ['execution_grant: payload segment mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.execution_grant = flipSegment(t.issuance.execution_grant, '.', 0); write('transcript.json', t); },
    'execution_grant signature does not verify'],
  ['execution_grant: signature segment mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.execution_grant = flipSegment(t.issuance.execution_grant, '.', 1); write('transcript.json', t); },
    'execution_grant signature does not verify'],
  ['execution_grant: DELETED (absence is not a pass)',
    ({ read, write }) => { const t = read('transcript.json'); delete t.issuance.execution_grant; write('transcript.json', t); },
    'execution_grant is absent'],
  ['execution_grant: truncated to one segment',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.execution_grant = t.issuance.execution_grant.split('.')[0]; write('transcript.json', t); },
    'execution_grant signature does not verify'],

  // ── chain_receipt ─────────────────────────────────────────────────────────────────────────
  ['chain_receipt: last character mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.chain_receipt = flipLast(t.issuance.chain_receipt); write('transcript.json', t); },
    'chain_receipt signature does not verify'],
  ['chain_receipt: payload segment mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.issuance.chain_receipt = flipSegment(t.issuance.chain_receipt, '.', 0); write('transcript.json', t); },
    'chain_receipt signature does not verify'],

  // ── transcript_token ──────────────────────────────────────────────────────────────────────
  ['transcript_token: preimage segment mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.transcript_token = flipSegment(t.transcript_token, '|', 2); write('transcript.json', t); },
    'transcript_token signature does not verify'],
  ['transcript_token: kid segment mutated (points at a key nobody pinned)',
    ({ read, write }) => { const t = read('transcript.json'); const s = t.transcript_token.split('|'); s[1] = `${s[1]}X`; t.transcript_token = s.join('|'); write('transcript.json', t); },
    'transcript_token signature does not verify'],
  ['transcript_token: DELETED',
    ({ read, write }) => { const t = read('transcript.json'); delete t.transcript_token; write('transcript.json', t); },
    'transcript_token is absent'],
  ['transcript_token: envelope version renamed',
    ({ read, write }) => { const t = read('transcript.json'); t.transcript_token = t.transcript_token.replace('cr.prove.transcript.v1', 'cr.prove.transcript.v9'); write('transcript.json', t); },
    'transcript_token signature does not verify'],

  // ── correlation: the signature ────────────────────────────────────────────────────────────
  ['correlation: signature last character mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.signature = flipLast(t.correlation.signature); write('transcript.json', t); },
    'correlation signature does not verify'],
  ['correlation: DELETED',
    ({ read, write }) => { const t = read('transcript.json'); delete t.correlation; write('transcript.json', t); },
    'correlation'],

  // ── correlation: each BINDING FIELD ───────────────────────────────────────────────────────
  ['correlation binding: scope_hash mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.scope_hash = flipLast(t.correlation.scope_hash); write('transcript.json', t); },
    'correlation'],
  ['correlation binding: contract_commit mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.contract_commit = flipLast(t.correlation.contract_commit); write('transcript.json', t); },
    'correlation'],
  ['correlation binding: contract_path mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.contract_path = `${t.correlation.contract_path}x`; write('transcript.json', t); },
    'correlation'],
  ['correlation binding: readback_commit mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.readback_commit = flipLast(t.correlation.readback_commit); write('transcript.json', t); },
    'correlation'],
  ['correlation binding: correlation_hash mutated',
    ({ read, write }) => { const t = read('transcript.json'); t.correlation.correlation_hash = flipLast(t.correlation.correlation_hash); write('transcript.json', t); },
    'correlation'],
  ['correlation binding: scope_hash AND correlation_hash both re-derived (a coherent lie)',
    ({ read, write }) => {
      const t = read('transcript.json');
      t.correlation.scope_hash = `sha256:${'0'.repeat(64)}`;
      const US = '\x1f';
      const pre = ['cr.exec.correlation.v1', t.correlation.scope_hash, t.correlation.contract_commit,
        t.correlation.contract_path, t.correlation.readback_commit].join(US);
      t.correlation.correlation_hash = `sha256:${crypto.createHash('sha256').update(pre, 'utf8').digest('hex')}`;
      write('transcript.json', t);
    },
    'correlation'],

  // ── the keyring itself ────────────────────────────────────────────────────────────────────
  ['keyring: the executor public key swapped for another valid key',
    ({ read, write }) => {
      const k = read('executor-keys.json');
      const { publicKey } = crypto.generateKeyPairSync('ed25519');
      k.keys[0].public_key_pem = publicKey.export({ type: 'spki', format: 'pem' });
      write('executor-keys.json', k);
    },
    'signature does not verify'],

  // ── continuity identities ─────────────────────────────────────────────────────────────────
  ['continuity: consumed_jti is not the issued one',
    ({ read, write }) => { const t = read('transcript.json'); t.continuity.identities.consumed_jti = '00000000-0000-4000-8000-000000000000'; write('transcript.json', t); },
    'authorization_not_continuous'],
  ['continuity: attestation_jti is not the issued one',
    ({ read, write }) => { const t = read('transcript.json'); t.continuity.identities.attestation_jti = '00000000-0000-4000-8000-000000000000'; write('transcript.json', t); },
    'authorization_not_continuous'],
  ['continuity: issued_jti rewritten (so nothing matches it)',
    ({ read, write }) => { const t = read('transcript.json'); t.continuity.identities.issued_jti = '00000000-0000-4000-8000-000000000000'; write('transcript.json', t); },
    'authorization_not_continuous'],
  ['continuity: the block is DELETED',
    ({ read, write }) => { const t = read('transcript.json'); delete t.continuity; write('transcript.json', t); },
    'authorization_not_continuous'],
  ['continuity: continuous flipped to false',
    ({ read, write }) => { const t = read('transcript.json'); t.continuity.continuous = false; t.continuity.reason = 'consume_jti_mismatch'; write('transcript.json', t); },
    'authorization_not_continuous'],

  // ── provenance ────────────────────────────────────────────────────────────────────────────
  ['provenance: working_tree_dirty flipped to true',
    ({ read, write }) => {
      const t = read('transcript.json'); t.provenance.working_tree_dirty = true; write('transcript.json', t);
      const p = read('pin.json'); p.provenance_from_artifact.working_tree_dirty = true; write('pin.json', p);
    },
    'not reproducible from a clean commit'],
  ['provenance: source_commit is not a commit',
    ({ read, write }) => {
      const t = read('transcript.json'); t.provenance.source_commit = 'not-a-commit'; write('transcript.json', t);
      const p = read('pin.json'); p.provenance_from_artifact.source_commit = 'not-a-commit'; write('pin.json', p);
    },
    'not reproducible from a clean commit'],

  // ── structural claims ─────────────────────────────────────────────────────────────────────
  ['POINT 8 downgraded to MODELLED',
    ({ read, write }) => { const t = read('transcript.json'); const p8 = t.points.find((p) => p.n === 8); p8.state = 'MODELLED'; write('transcript.json', t); },
    'POINT 8'],
  ['run_id: one point belongs to a different run',
    ({ read, write }) => { const t = read('transcript.json'); t.points[3].run_id = 'prove-00000000-0000-4000-8000-000000000000'; write('transcript.json', t); },
    ''],
  ['readback: commit no longer names the governed contract',
    ({ read, write }) => { const r = read('readback.json'); r.commit = 'f'.repeat(40); write('readback.json', r); },
    'readback'],
  ['readback: observed_at postdates the run',
    ({ read, write }) => { const r = read('readback.json'); r.observed_at = '2099-01-01T00:00:00Z'; write('readback.json', r); },
    'readback_future'],
  ['negative pole: shares the positive run_id (it is the same run)',
    ({ read, write }) => { const t = read('transcript.json'); const n = read('negative-transcript.json'); n.run_id = t.run_id; write('negative-transcript.json', n); },
    'run_id'],
  ['negative pole: no longer refuses (POINT 8 PROVEN)',
    ({ read, write }) => { const n = read('negative-transcript.json'); const p8 = n.points.find((p) => p.n === 8); p8.state = 'PROVEN'; write('negative-transcript.json', n); },
    'negative pole'],
  ['negative pole: DELETED',
    ({ read, write, dir }) => { fs.rmSync(path.join(dir, 'negative-transcript.json')); },
    'negative'],
];

describe('evidence mutation matrix — one byte must never grade COVERED', () => {
  it('the honest fixture is COVERED, so every refusal below is the mutation talking', () => {
    const r = measureContractE2E();
    assert.equal(r.coverage, 'COVERED', JSON.stringify(r.missing));
    assert.equal(r.green, true);
  });

  it('the matrix is not thin — a handful of cases would prove a handful of paths', () => {
    assert.ok(CASES.length >= 30, `only ${CASES.length} mutations; the matrix must cover at least 30`);
  });

  for (const [name, mutate, expect] of CASES) {
    it(`REFUSED: ${name}`, () => {
      const r = measureMutated(mutate);
      assert.notEqual(r.coverage, 'COVERED', `this mutation graded COVERED:\n${JSON.stringify(r, null, 2)}`);
      assert.equal(r.green, false);
      if (expect) {
        const named = (r.missing || []).some((m) => m.includes(expect));
        assert.ok(named, `refused, but not for the expected reason "${expect}":\n${(r.missing || []).join('\n')}`);
      }
    });
  }
});
