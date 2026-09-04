/**
 * Evidence envelope — cr.conformance.v1.
 *
 * Two axes stay separate: coverage (what the property is) vs evidence_tier (how we know).
 * Execution result is a third field. COVERED + LIVE + FAIL means the property is covered
 * AND the run found a regression — that is not a hole in coverage.
 *
 * Conformance never mints evidence. self_minted:false is enforced, not documented.
 *
 * @module @coderifts/conformance/lib/evidence-envelope
 */
'use strict';

const crypto = require('node:crypto');

const CLAIM_VERSION = 'cr.conformance.v1';

const COVERAGE = Object.freeze({
  COVERED: 'COVERED',
  PARTIAL: 'PARTIAL',
  NOT_COVERED: 'NOT_COVERED',
});

const EVIDENCE_TIER = Object.freeze({
  LIVE: 'LIVE',
  RECORDED: 'RECORDED',
  MODELLED: 'MODELLED',
  NOT_RUN: 'NOT_RUN',
});

const RESULT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
});

const ARTIFACT_ROLES = Object.freeze(['positive', 'negative']);

const REQUIRED_FIELDS = Object.freeze([
  'profile', 'coverage', 'evidence_tier', 'claim_version',
  'subject', 'producer', 'run_id', 'observed_at', 'inputs_sha256',
  'artifacts', 'self_minted', 'freshness', 'does_not_prove',
]);

function sha256hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function digestOf(buf) {
  return `sha256:${sha256hex(buf)}`;
}

function identityDigest(id) {
  if (!id || typeof id !== 'object') return 'missing identity';
  if (typeof id.name !== 'string' || !id.name) return 'identity.name missing';
  if (typeof id.version !== 'string' || !id.version) return 'identity.version missing';
  if (typeof id.digest !== 'string' || !id.digest) return 'identity.digest missing';
  return null;
}

/**
 * Validate a cr.conformance.v1 envelope against the schema and the attached bytes.
 *
 * @param {object} envelope
 * @param {{ attached?: Array<{role:string, bytes:Buffer|string, sha256?:string}>,
 *           subjectBytes?: Buffer|string,
 *           verifySignature?: function,
 *           operational?: boolean }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateEnvelope(envelope, opts = {}) {
  const errors = [];
  const operational = opts.operational !== false;

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { ok: false, errors: ['envelope is not an object'] };
  }

  for (const f of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(envelope, f)) {
      errors.push(`missing field ${f}`);
    }
  }

  if (envelope.claim_version !== CLAIM_VERSION) {
    errors.push(`claim_version must be ${CLAIM_VERSION}, got ${JSON.stringify(envelope.claim_version)}`);
  }
  if (!Object.values(COVERAGE).includes(envelope.coverage)) {
    errors.push(`coverage not on the coverage axis: ${JSON.stringify(envelope.coverage)}`);
  }
  if (!Object.values(EVIDENCE_TIER).includes(envelope.evidence_tier)) {
    errors.push(`evidence_tier not on the evidence axis: ${JSON.stringify(envelope.evidence_tier)}`);
  }
  if (envelope.result != null && !Object.values(RESULT).includes(envelope.result)) {
    errors.push(`result not PASS|FAIL: ${JSON.stringify(envelope.result)}`);
  }

  // Axis discipline: MODELLED is a model, never an operational COVERED claim.
  if (envelope.evidence_tier === EVIDENCE_TIER.MODELLED
      && envelope.coverage === COVERAGE.COVERED
      && operational) {
    errors.push('MODELLED cannot be promoted to COVERED on an operational profile');
  }

  if (envelope.self_minted !== false) {
    errors.push('self_minted must be false — conformance never mints evidence');
  }

  if (envelope.evidence_tier === EVIDENCE_TIER.RECORDED && operational) {
    if (!Array.isArray(envelope.does_not_prove) || envelope.does_not_prove.length === 0) {
      errors.push('does_not_prove must be non-empty for every RECORDED operational profile');
    }
  }

  const subErr = identityDigest(envelope.subject);
  if (subErr) errors.push(`subject: ${subErr}`);
  const prodErr = identityDigest(envelope.producer);
  if (prodErr) errors.push(`producer: ${prodErr}`);

  if (typeof envelope.profile !== 'string' || !envelope.profile) {
    errors.push('profile missing');
  }
  if (typeof envelope.run_id !== 'string' || !envelope.run_id) {
    errors.push('run_id missing');
  }
  if (typeof envelope.observed_at !== 'string' || !envelope.observed_at) {
    errors.push('observed_at missing');
  }
  if (typeof envelope.inputs_sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(envelope.inputs_sha256)) {
    errors.push('inputs_sha256 must be sha256:<64 hex>');
  }
  if (envelope.freshness == null) {
    errors.push('freshness missing');
  }

  const arts = envelope.artifacts;
  if (!Array.isArray(arts)) {
    errors.push('artifacts must be an array');
  } else {
    let positive = 0;
    let negative = 0;
    for (let i = 0; i < arts.length; i += 1) {
      const a = arts[i];
      if (!a || typeof a !== 'object') {
        errors.push(`artifacts[${i}] is not an object`);
        continue;
      }
      if (!ARTIFACT_ROLES.includes(a.role)) {
        errors.push(`artifacts[${i}].role must be positive|negative, got ${JSON.stringify(a.role)}`);
      }
      if (a.role === 'positive') positive += 1;
      if (a.role === 'negative') negative += 1;
      if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) {
        errors.push(`artifacts[${i}].sha256 must be 64 hex chars`);
      }
    }
    if (envelope.coverage === COVERAGE.COVERED && (positive < 1 || negative < 1)) {
      errors.push('COVERED requires at least one positive and one negative artifact');
    }
  }

  const attached = Array.isArray(opts.attached) ? opts.attached : [];
  for (const item of attached) {
    const bytes = Buffer.isBuffer(item.bytes) ? item.bytes : Buffer.from(String(item.bytes));
    const got = sha256hex(bytes);
    const expected = item.sha256 || (arts || []).find((a) => a.role === item.role)?.sha256;
    if (!expected) {
      errors.push(`attached ${item.role || 'artifact'} has no envelope sha256 to check`);
    } else if (got !== expected) {
      errors.push(`attached ${item.role || 'artifact'} sha256 mismatch: pin ${expected} bytes ${got}`);
    }
  }

  if (opts.subjectBytes != null && envelope.subject && typeof envelope.subject.digest === 'string') {
    const got = digestOf(Buffer.isBuffer(opts.subjectBytes)
      ? opts.subjectBytes
      : Buffer.from(String(opts.subjectBytes)));
    if (envelope.subject.digest !== got) {
      errors.push(`subject.digest mismatch: envelope ${envelope.subject.digest} bytes ${got}`);
    }
  }

  if (typeof opts.verifySignature === 'function') {
    let sig;
    try {
      sig = opts.verifySignature(envelope);
    } catch (err) {
      errors.push(`envelope signature threw: ${err && err.message ? err.message : err}`);
      sig = null;
    }
    if (sig && sig.ok === false) {
      errors.push(`envelope signature invalid: ${sig.error || 'unspecified'}`);
    } else if (sig && sig.ok !== true) {
      errors.push('envelope signature verifier did not return {ok:true}');
    }
  } else if (envelope.coverage === COVERAGE.COVERED
      || envelope.coverage === COVERAGE.PARTIAL
      || envelope.evidence_tier === EVIDENCE_TIER.RECORDED
      || envelope.evidence_tier === EVIDENCE_TIER.LIVE) {
    errors.push('envelope signature not verified — pass verifySignature');
  }

  if (Array.isArray(opts.bindings)) {
    for (const b of opts.bindings) {
      if (b && b.ok === false) {
        errors.push(`cross-artifact binding failed: ${b.name || 'unnamed'} — ${b.error || ''}`.trim());
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function assertValidEnvelope(envelope, opts) {
  const r = validateEnvelope(envelope, opts);
  if (!r.ok) {
    const err = new Error(`evidence-envelope: ${r.errors.join('; ')}`);
    err.errors = r.errors;
    throw err;
  }
  return envelope;
}

module.exports = {
  CLAIM_VERSION,
  COVERAGE,
  EVIDENCE_TIER,
  RESULT,
  ARTIFACT_ROLES,
  REQUIRED_FIELDS,
  sha256hex,
  digestOf,
  validateEnvelope,
  assertValidEnvelope,
};
