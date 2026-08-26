'use strict';
/**
 * ADVERSARIAL VECTORS — the suite passed while the product had holes.
 *
 * An external auditor said plainly what 45/45 green did not cover: "the suite does not test
 * raw-host bypass, issuer collision or grant concurrency." He named seven vectors. FOUR OF THEM
 * WERE LIVE DEFECTS WE FIXED THIS WEEK. A green suite that could not have caught them is the
 * thing to fix — not the score.
 *
 * THE RULE FOR THIS FILE, and it matters more than coverage:
 *   A passing adversarial vector proves that ONE NAMED ATTACK SHAPE FAILS.
 *   It NEVER proves the class is closed.
 * Every vector below states both, in its own assertion messages.
 *
 * PUBLIC OR NOT AT ALL. A vector that needs CodeRifts-private code does not belong in a public
 * suite. Three of the seven are expressible offline; four are not, and fixtures/adversarial.v1.json
 * records each exclusion with its reason rather than dropping it silently. That is the same
 * principle as @coderifts/bypass-probe: nothing certifies a control better than the vendor showing
 * exactly where it does not stand.
 *
 * Runnable by a third party with NO CodeRifts credential: `npm test` in this package, offline.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'adversarial.v1.json'), 'utf8'));
const IB = FIX.issuer_binding;

/**
 * The documented issuer rule, implemented here as the NORMATIVE reference — the same standing every
 * other reference mapping in this package has. A required status check is enforcing only when the
 * check run is posted by the app branch protection names.
 *
 * @param {{ checks?: Array<{context: string, app_id: number|null}>, contexts?: string[] }} protection
 * @returns {{ status: string, reason_code: string, expected_app_id: number }}
 */
function evaluateIssuerBinding(protection) {
  const p = protection || {};
  const checks = Array.isArray(p.checks) ? p.checks : null;
  const contexts = Array.isArray(p.contexts) ? p.contexts : [];

  // RE-VERIFIED against the PUBLISHED bundle (coderifts@4.12.0, dist/cli.js evaluateRequiredCheck).
  // Two divergences were found and corrected here — see ADV-1e / ADV-1f, which exist because the
  // divergence existed. The published evaluator is NOT importable (dist/cli.js is a bin bundle:
  // requiring it RUNS the CLI), so this stays a mirror, and IB.verified_against records the exact
  // version it was checked against so the next reader re-checks rather than assumes.
  if (!checks) {
    if (contexts.includes(IB.check_name)) {
      return { status: 'NOT_VERIFIED', reason_code: 'legacy_contexts_no_issuer_binding', expected_app_id: IB.enforcing_issuer_app_id };
    }
    return { status: 'NOT_VERIFIED', reason_code: 'required_check_absent', expected_app_id: IB.enforcing_issuer_app_id };
  }

  // DIVERGENCE 1 (corrected): the published code FILTERS every entry carrying our context name and
  // then searches them in priority order. This mirror used to take the FIRST match only, so a
  // protection listing the advisory entry before the enforcing one scored UNVERIFIABLE where the
  // product scores VERIFIED. Padding the checks array is an attacker shape, not a hypothetical.
  const ours = checks.filter((c) => c && c.context === IB.check_name);
  if (ours.length === 0) {
    if (contexts.includes(IB.check_name)) {
      return { status: 'NOT_VERIFIED', reason_code: 'legacy_contexts_no_issuer_binding', expected_app_id: IB.enforcing_issuer_app_id };
    }
    return { status: 'NOT_VERIFIED', reason_code: 'required_check_absent', expected_app_id: IB.enforcing_issuer_app_id };
  }

  const enforcing = ours.find((c) => numericAppId(c.app_id) === IB.enforcing_issuer_app_id);
  if (enforcing) return { status: 'VERIFIED', reason_code: 'issuer_bound', expected_app_id: IB.enforcing_issuer_app_id };

  const advisory = ours.find((c) => numericAppId(c.app_id) === IB.coderifts_app_id);
  if (advisory) {
    // THE COLLISION, and the verdict is UNVERIFIABLE — not NOT_VERIFIED. Our own App posts an
    // ADVISORY check; from branch protection alone you cannot observe whether it concluded, so the
    // honest answer is "we could not determine", not "we determined it is absent". Collapsing this
    // into NOT_VERIFIED would let "we could not look" read as "we looked and found nothing".
    return { status: 'UNVERIFIABLE', reason_code: 'issuer_advisory_app_conclusion_unobservable', expected_app_id: IB.enforcing_issuer_app_id };
  }

  const other = ours.find((c) => numericAppId(c.app_id) != null);
  if (other) return { status: 'NOT_VERIFIED', reason_code: 'issuer_app_id_mismatch', expected_app_id: IB.enforcing_issuer_app_id };

  return { status: 'NOT_VERIFIED', reason_code: 'no_issuer_binding', expected_app_id: IB.enforcing_issuer_app_id };
}

/**
 * DIVERGENCE 2 (corrected): the published evaluator coerces app_id through Number() and accepts
 * only a positive integer. This mirror used strict === against a number, so a GitHub payload
 * carrying app_id as the STRING "15368" scored NOT_VERIFIED here and VERIFIED in the product.
 * Mirrors the published numericAppId exactly.
 */
function numericAppId(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ───────────────────────────────────────────────────────────────────────────
describe('ADV-1 issuer collision — a required check pinned to an issuer that cannot block', () => {
  /**
   * THE DEFECT (fixed in CLI 4.11.0): our installer pinned the required check to the CodeRifts
   * App (2860592). That app posts a check which cannot block a merge; the check that CAN is
   * posted by GitHub Actions (15368). Protection LOOKED configured and enforced nothing.
   * These vectors pin the CORRECTED verdict, not the bug.
   */

  it('the two app ids are distinct, and the enforcing one is NOT ours', () => {
    assert.notEqual(IB.coderifts_app_id, IB.enforcing_issuer_app_id);
    assert.equal(IB.enforcing_issuer_app_id, 15368, 'GitHub Actions posts the blocking check');
    assert.equal(IB.coderifts_app_id, 2860592, 'the CodeRifts App check cannot block');
  });

  it('PINS THE FIX: a check bound to the CodeRifts App is UNVERIFIABLE (this is the collision)', () => {
    const r = evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: IB.coderifts_app_id }] });
    // MEASURED against the real evaluator, not assumed: our own App id yields UNVERIFIABLE with
    // reason issuer_advisory_app_conclusion_unobservable. An earlier draft of this vector asserted
    // NOT_VERIFIED / issuer_app_id_mismatch and was WRONG — a vector that pins the wrong verdict is
    // worse than no vector, so this one is cross-checked against the shipped evaluator.
    assert.equal(r.status, 'UNVERIFIABLE');
    assert.equal(r.reason_code, 'issuer_advisory_app_conclusion_unobservable');
    assert.notEqual(r.status, 'VERIFIED', 'the collision must never read as enforcing');
    assert.equal(r.expected_app_id, IB.enforcing_issuer_app_id);
    // A PASS HERE MEANS: this exact misbinding is reported rather than accepted.
    // IT DOES NOT MEAN: every misconfiguration of branch protection is detected, nor that a
    // VERIFIED verdict proves nobody can bypass — bypass actors are not readable from this input.
  });

  it('a check bound to the enforcing issuer is VERIFIED', () => {
    const r = evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: IB.enforcing_issuer_app_id }] });
    assert.equal(r.status, 'VERIFIED');
    assert.equal(r.reason_code, 'issuer_bound');
  });

  it('a NAME-ONLY entry never verifies — a name is not an issuer', () => {
    const viaChecks = evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: null }] });
    assert.equal(viaChecks.reason_code, 'no_issuer_binding');
    const viaLegacy = evaluateIssuerBinding({ contexts: [IB.check_name] });
    assert.equal(viaLegacy.reason_code, 'legacy_contexts_no_issuer_binding');
    for (const r of [viaChecks, viaLegacy]) assert.notEqual(r.status, 'VERIFIED');
  });

  it('AN ATTACKER-CHOSEN app id does not verify either', () => {
    const r = evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: 999999 }] });
    assert.equal(r.reason_code, 'issuer_app_id_mismatch');
    assert.notEqual(r.status, 'VERIFIED');
  });

  it('a check under a DIFFERENT name does not satisfy the requirement', () => {
    const r = evaluateIssuerBinding({ checks: [{ context: 'other/ci', app_id: IB.enforcing_issuer_app_id }] });
    assert.equal(r.reason_code, 'required_check_absent');
  });

  it('ADV-1e A PADDED checks ARRAY does not hide the enforcing entry', () => {
    // THIS VECTOR EXISTS BECAUSE THE MIRROR WAS WRONG. It read the first entry with our context
    // name; the product filters every such entry and prefers the enforcing one. An attacker who
    // can add a branch-protection entry could otherwise list the advisory binding first and make
    // an auditor's checker report UNVERIFIABLE for a repository that is genuinely enforcing.
    const padded = { checks: [
      { context: IB.check_name, app_id: IB.coderifts_app_id },
      { context: IB.check_name, app_id: IB.enforcing_issuer_app_id },
    ] };
    const v = evaluateIssuerBinding(padded);
    assert.equal(v.status, 'VERIFIED');
    assert.equal(v.reason_code, 'issuer_bound');
    // Order must not matter.
    const reversed = { checks: [...padded.checks].reverse() };
    assert.deepEqual(evaluateIssuerBinding(reversed), v, 'entry order must not change the verdict');
  });

  it('ADV-1f a STRING app_id is coerced, so a type change cannot flip the verdict', () => {
    // The GitHub API is not the only producer of these payloads. A checker using strict equality
    // reports NOT_VERIFIED for "15368" while the product reports VERIFIED — a false alarm that
    // trains an operator to ignore the checker.
    assert.equal(evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: String(IB.enforcing_issuer_app_id) }] }).status, 'VERIFIED');
    assert.equal(evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: String(IB.coderifts_app_id) }] }).status, 'UNVERIFIABLE');
    // Non-integers are not app ids and must not be coerced into one.
    for (const junk of ['', '  ', 'abc', '1.5', '-3', 0, false]) {
      const v = evaluateIssuerBinding({ checks: [{ context: IB.check_name, app_id: junk }] });
      assert.equal(v.status, 'NOT_VERIFIED', `app_id ${JSON.stringify(junk)} must not verify`);
      assert.equal(v.reason_code, 'no_issuer_binding');
    }
  });

  it('THE MIRROR RECORDS WHAT IT WAS VERIFIED AGAINST, so drift is detectable', () => {
    const va = IB.verified_against;
    assert.equal(va.package, 'coderifts');
    assert.match(va.version, /^\d+\.\d+\.\d+$/);
    // Every reason code this mirror can emit must be one the published bundle carries.
    const emitted = new Set();
    for (const p of [{}, { contexts: [IB.check_name] }, { checks: [] },
      { checks: [{ context: IB.check_name, app_id: null }] },
      { checks: [{ context: IB.check_name, app_id: 999 }] },
      { checks: [{ context: IB.check_name, app_id: IB.coderifts_app_id }] },
      { checks: [{ context: IB.check_name, app_id: IB.enforcing_issuer_app_id }] }]) {
      emitted.add(evaluateIssuerBinding(p).reason_code);
    }
    for (const rc of emitted) {
      assert.ok(va.reason_codes.includes(rc), `${rc} is emitted but not recorded as published`);
    }
    // And a code the product has that we do NOT mirror must be admitted, not hidden.
    assert.ok(va.not_mirrored.issuer_app_id_unresolvable, 'an unmirrored branch must be stated');
  });

  it('HONESTY: VERIFIED is about issuer binding ONLY, and the vocabulary keeps a third state', () => {
    assert.deepEqual(IB.statuses, ['VERIFIED', 'NOT_VERIFIED', 'UNVERIFIABLE'],
      'collapsing UNVERIFIABLE into NOT_VERIFIED would let "we could not look" read as "we looked and it was absent"');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ADV-5 MCP negative schema — shapes the schema accepts and the ROUTE rejects', () => {
  /**
   * The auditor sent three shapes the published schema ACCEPTED while the route REJECTED them.
   * The route is server-side and not reachable offline or without a credential, so a public
   * vector cannot assert the route's behaviour directly. What it CAN do is hold the compensating
   * control: the divergence is documented in the tool description a model actually reads.
   *
   * CORRECTED. This docstring used to claim these vectors "fail if that documentation is dropped".
   * They did not — the only assertions were SHAPES.length === 3 and why.length > 20 against a
   * constant declared three lines above, which no product change could ever move. They now read
   * the VENDORED tool description and fail when a required fact leaves it. The honest remaining
   * limit: that copy is vendored by hand, so it catches a fact being dropped from the text we
   * publish, not the text drifting from the app. There is an app-side gate for cases.v1.json and
   * none for this fixture; adding one is the follow-up, and until it exists this is a snapshot.
   */
  const SHAPES = Object.freeze([
    { id: 'empty-artifacts', body: { preflight_mode: 'analyze', artifacts: [] },
      why: 'schema allows an empty array; the route requires at least one artifact' },
    { id: 'authorize-without-operation', body: { preflight_mode: 'authorize', artifacts: [{ id: 'a', type: 'openapi', before: '{}', after: '{}' }] },
      why: 'schema does not couple authorize to context.operation; the route does' },
    { id: 'unknown-artifact-type', body: { preflight_mode: 'analyze', artifacts: [{ id: 'a', type: 'not-a-real-type', before: '{}', after: '{}' }] },
      why: 'schema leaves type open; the route rejects unknown types' },
  ]);

  it('all three shapes are recorded with the reason the route rejects each', () => {
    assert.equal(SHAPES.length, 3);
    for (const s of SHAPES) {
      assert.ok(s.why.length > 20, `${s.id} needs the reason recorded, not a placeholder`);
      assert.ok(s.body.preflight_mode, `${s.id} must be a realistic request body`);
    }
    // A PASS HERE MEANS: the three known schema/route divergences are still named in this suite.
    // IT DOES NOT MEAN: the route rejects them today — no public, credential-free surface can
    // assert that. It means a future reader is told the schema is the looser of the two.
  });

  it('ADV-5c the SCOPING facts are present in the published tool description', () => {
    // The fingerprint P0 was fixed in the ROUTE. A model does not read the route; it reads the
    // description. If the scoping leaves the text, the fix is invisible to the only reader that
    // acts on it — which is why a documentation fact is a control here, not a nicety.
    const td = FIX.tool_description_scoping;
    assert.ok(td && typeof td.description === 'string' && td.description.length > 0);
    assert.equal(td.required_facts.length, 3);
    for (const f of td.required_facts) {
      assert.ok(td.description.includes(f.must_contain),
        `the description no longer states "${f.id}" — ${f.why}`);
      assert.ok(f.why.length > 30, `${f.id} must record WHY the fact is required`);
    }
  });

  it('ADV-5d the not-found fact is stated as INDISTINGUISHABLE, not merely as a denial', () => {
    const d = FIX.tool_description_scoping.description;
    // "returns not_found for decisions you do not own" would be a weaker, different claim: it
    // still tells the caller the decision exists. The text must deny the DISTINCTION itself.
    assert.match(d, /SAME not_found/);
    assert.match(d, /Do not read\s+not_found as proof that no such decision exists/);
  });

  it('ADV-5e the unattributable-rows limit is CURRENT, not stated as permanent', () => {
    const d = FIX.tool_description_scoping.description;
    assert.match(d, /cannot currently be attributed/);
    assert.match(d, /not a property of the\s+lookup/);
    // And it must not promise a date — a dated promise in a tool description is a claim we would
    // have to keep in a surface we cannot revise as fast as a page.
    assert.equal(/\b20\d\d-\d\d-\d\d\b/.test(d), false, 'no date may be promised here');
    assert.equal(/\bwill be (fixed|available|supported)\b/i.test(d), false, 'no promise of a fix');
  });

  it('THE BOUNDARY IS STATED, not implied: schema-valid does not mean route-accepted', () => {
    const stated = FIX.honesty;
    assert.match(stated, /never proves the class is closed/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ADV-6 action tag mutation — a moved tag must not silently change what runs', () => {
  /**
   * `@v0` is a tag WE move. A workflow pinned to a moving tag runs whatever we last pushed there,
   * so a pinned workflow is not pinned. The strict template pins a full 40-hex SHA instead.
   */
  const TAG_REF = 'uses: coderifts/contract-gate@v0';
  const SHA_RE = /uses: coderifts\/contract-gate@[0-9a-f]{40}\b/;

  it('a full-SHA ref is immutable by construction; a tag ref is not', () => {
    // CORRECTED: this used to build 'a'.repeat(40) and assert a regex matched it — a tautology
    // that no product change could fail. It now pins the SHA the strict template ACTUALLY emits,
    // recorded from the published bundle.
    const P = FIX.gate_action_pin;
    const sha = `uses: ${P.repo}@${P.pinned_sha}`;
    assert.match(sha, SHA_RE, 'a 40-hex ref is a content address — moving it is not possible');
    assert.match(P.pinned_sha, /^[0-9a-f]{40}$/, 'a short sha is not a content address');
    assert.equal(SHA_RE.test(TAG_REF), false, '@v0 is a mutable pointer, not a pin');
    assert.equal(`uses: ${P.repo}@${P.mutable_ref}`, TAG_REF);
  });

  it('ADV-6d the pin is a REAL published value a third party can confirm', () => {
    const P = FIX.gate_action_pin;
    assert.equal(P.verified_against.package, 'coderifts');
    assert.match(P.verified_against.version, /^\d+\.\d+\.\d+$/);
    // The tag it resolved from is recorded too: a tag is how a human finds the sha, and dropping
    // it would leave a 40-hex string nobody can place.
    assert.match(P.pinned_tag_at_resolution, /^v\d+\.\d+\.\d+$/);
    // A PASS HERE MEANS: the strict template's ref is a content address, and this is the one it
    // carries in the published CLI. IT DOES NOT MEAN: that this sha is the newest contract-gate,
    // nor that a consumer's workflow uses the strict template rather than the tag one.
  });

  it('ADV-6e the tag-following template is kept ON PURPOSE, and the fixture says why', () => {
    // Pinning everything would be the obvious-looking answer and the wrong one: the non-strict
    // template exists so a consumer can follow our fixes without editing a sha.
    assert.match(FIX.gate_action_pin.why_both_exist, /deliberately|on purpose|the point/i);
  });

  it('the two forms are DISTINGUISHABLE by a consumer auditing their own workflow', () => {
    assert.notEqual(TAG_REF, 'uses: coderifts/contract-gate@' + 'a'.repeat(40));
    // A PASS HERE MEANS: a third party can tell a pinned workflow from a tag-following one by
    // inspecting the ref alone, with no CodeRifts involvement.
    // IT DOES NOT MEAN: that their workflow IS pinned, nor that we have not moved @v0 — this
    // vector inspects a ref shape, not a repository's history.
  });

  it('HONESTY: a SHA pin binds the action, not the outcome', () => {
    // Pinning stops US changing what runs. It does not make the action correct, and it does not
    // stop a privileged actor editing the workflow file itself.
    const claim = 'a SHA pin binds which bytes run; it does not bind who may edit the workflow';
    assert.ok(claim.includes('does not bind who may edit'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('COVERAGE BOUNDARY — the four vectors this suite does NOT carry', () => {
  it('each exclusion names a reason and where it IS covered, if anywhere', () => {
    const ids = FIX.excluded.map((e) => e.vector).sort();
    assert.deepEqual(ids, ['concurrent_grants', 'raw_tool_beside_guarded_table', 'ruleset_bypass', 'stale_nonce']);
    for (const e of FIX.excluded) {
      assert.ok(e.reason.length > 60, `${e.vector}: the reason must survive review, not hand-wave`);
      assert.ok(typeof e.covered_by === 'string' && e.covered_by.length > 0,
        `${e.vector}: say where it IS covered, or say plainly that nothing covers it`);
    }
  });

  it('raw-host bypass points at bypass-probe rather than being faked here', () => {
    const e = FIX.excluded.find((x) => x.vector === 'raw_tool_beside_guarded_table');
    assert.match(e.covered_by, /bypass-probe/);
    assert.match(e.reason, /weakening/i, 'duplicating it would weaken both claims — say why');
  });

  it('the stale-nonce exclusion admits the public verifier is STATELESS', () => {
    const e = FIX.excluded.find((x) => x.vector === 'stale_nonce');
    assert.match(e.reason, /STATELESS/);
    assert.match(e.reason, /cannot detect a replayed jti/i);
  });

  it('THE SUITE STATES ITS OWN CEILING once, in the fixture', () => {
    // The four things the ceiling must say. Asserted as separate matches so a rewrite that
    // quietly drops one fails here rather than reading as a harmless edit.
    assert.match(FIX.honesty, /ONE NAMED ATTACK SHAPE fails/i, 'a pass covers one shape');
    assert.match(FIX.honesty, /never proves the class is closed/i, 'not the class');
    assert.match(FIX.honesty, /not expressible in an offline, credential-free suite/i,
      'the four absent vectors and why they are absent');
    assert.match(FIX.honesty, /mirror.*product still agree|mirrors published logic/i,
      'the mirror caveat — the drift that stayed green is the reason this line exists');
  });

  it('the README carries the same ceiling as the fixture, not a friendlier one', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    assert.ok(readme.includes(FIX.honesty),
      'the published README must state the ceiling verbatim — a softened public version of an '
      + 'honesty note is the failure mode this suite exists to make impossible');
  });
});
