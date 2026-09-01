/**
 * Shared rule interpreter for the Automated MARPOL Compliance Inspection System.
 *
 * This module is imported UNCHANGED by both the offline client and the server.
 * That is the point: the officer's field feedback and the server's authoritative
 * determination are produced by the same code, so the two cannot diverge except
 * where the rule set itself has changed — which the template version check
 * detects (Chapter Four, Section 4.1.3).
 *
 * Implements:
 *   isApplicable()          FR-23   applicability driven by vessel record
 *   evaluateCertificate()   FR-24   expiry as arithmetic, not as reading
 *   scoreInspection()       FR-31   weighted scoring, detainable override
 *   reconcileCustody()      FR-42   four-stage variance, unit-mismatch refusal
 */

export const EXPIRY_HORIZON_DAYS = 30;   // configurable forward horizon (FR-24)
export const VARIANCE_TOLERANCE_PCT = 10; // configurable tolerance (FR-42)

/* ------------------------------------------------------------------ */
/* 1. APPLICABILITY                                                    */
/* ------------------------------------------------------------------ */
/**
 * Evaluate a declarative applicability rule against a vessel record.
 * A null/undefined rule means the item always applies.
 *
 * Rule grammar (stored as JSONB on checklist_item.applicability_rule):
 *   { "vessel_type": ["OIL_TANKER","CHEMICAL_TANKER"] }   membership
 *   { "grt": { "gte": 400 } }                             comparison
 *   { "is_nigerian_flag": true }                          equality
 *   { "vessel_type": [...], "grt": { "gte": 400 } }       conjunction
 */
export function isApplicable(rule, vessel) {
  if (rule === null || rule === undefined) return true;
  if (typeof rule !== 'object') return true;

  return Object.entries(rule).every(([field, test]) => {
    const actual = vessel ? vessel[field] : undefined;

    if (Array.isArray(test)) return test.includes(actual);

    if (test !== null && typeof test === 'object') {
      if (test.gte !== undefined && !(actual >= test.gte)) return false;
      if (test.lte !== undefined && !(actual <= test.lte)) return false;
      if (test.gt !== undefined && !(actual > test.gt)) return false;
      if (test.lt !== undefined && !(actual < test.lt)) return false;
      if (test.in !== undefined && !test.in.includes(actual)) return false;
      return true;
    }
    return actual === test;
  });
}

/* ------------------------------------------------------------------ */
/* 2. CERTIFICATE EXPIRY                                               */
/* ------------------------------------------------------------------ */
/**
 * Determine the validity state of a sighted certificate by arithmetic
 * comparison against the inspection date. This is the mechanism that
 * removes the class of error described in Chapter One, Section 1.2,
 * in which an officer reads a date and compares it mentally.
 *
 * Returns: NOT_SIGHTED | NO_DATE | EXPIRED | EXPIRING_SOON | VALID
 */
export function evaluateCertificate(certificate, inspectionDate, horizonDays = EXPIRY_HORIZON_DAYS) {
  if (!certificate || certificate.sighted_state !== 'YES') return 'NOT_SIGHTED';
  if (!certificate.valid_until) return 'NO_DATE';

  const validUntil = toDate(certificate.valid_until);
  const inspected = toDate(inspectionDate);
  if (!validUntil || !inspected) return 'NO_DATE';

  const msPerDay = 86400000;
  const daysRemaining = Math.floor((validUntil - inspected) / msPerDay);

  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= horizonDays) return 'EXPIRING_SOON';
  return 'VALID';
}

function toDate(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const d = new Date(`${v}`.slice(0, 10) + 'T00:00:00Z');
  return isNaN(d) ? null : d;
}

/* ------------------------------------------------------------------ */
/* 3. WEIGHTED COMPLIANCE SCORING                                      */
/* ------------------------------------------------------------------ */
/**
 * Compute the weighted compliance score and resolve the overall state.
 *
 * Two properties are deliberate and are defended in Chapter Four, 4.2.6:
 *
 *  (a) Inapplicable items are EXCLUDED from the attainable total rather than
 *      credited as conforming. Crediting them would inflate the score of a
 *      simple vessel relative to a complex one for reasons unrelated to
 *      compliance.
 *
 *  (b) A deficiency carrying a detainable action code GOVERNS the overall
 *      state regardless of the arithmetic score. A single detainable finding
 *      is not offset by conformity elsewhere.
 *
 * @param {Array}  items      checklist_item rows (with weight, applicability_rule)
 * @param {Map}    responses  item_id -> inspection_response
 * @param {Object} vessel     vessel record
 * @param {Object} opts       { actionCodes: Map<action_id, {is_detention}> }
 */
export function scoreInspection(items, responses, vessel, opts = {}) {
  const actionCodes = opts.actionCodes || new Map();

  let attainable = 0;
  let attained = 0;
  let answered = 0;
  let applicableCount = 0;
  const deficiencies = [];

  for (const item of items) {
    if (!isApplicable(item.applicability_rule, vessel)) continue;
    applicableCount += 1;

    const r = responses.get ? responses.get(item.item_id) : responses[item.item_id];

    // Officer may still mark an applicable item N/A on the facts aboard.
    if (!r || r.response_state === 'NOT_APPLICABLE') continue;
    if (r.response_state === 'UNANSWERED') continue;

    answered += 1;
    const weight = Number(item.weight) || 1;
    attainable += weight;

    if (r.response_state === 'CONFORMING') {
      attained += weight;
    } else if (r.response_state === 'NON_CONFORMING') {
      deficiencies.push({
        item_id: item.item_id,
        response_id: r.response_id,
        code_id: r.deficiency_code_id ?? null,
        action_id: r.action_code_id ?? null,
      });
    }
  }

  const score = attainable === 0 ? null
    : Math.round((attained / attainable) * 10000) / 100;

  const detainable = deficiencies.some(d => {
    const ac = actionCodes.get ? actionCodes.get(d.action_id) : actionCodes[d.action_id];
    return Boolean(ac && ac.is_detention);
  });

  return {
    score,
    attainable,
    attained,
    applicableCount,
    answeredCount: answered,
    deficiencies,
    state: resolveState({ score, deficiencies, detainable, applicableCount, answered }),
  };
}

function resolveState({ score, deficiencies, detainable, applicableCount, answered }) {
  if (detainable) return 'DETAINABLE';                 // overrides arithmetic
  if (applicableCount > 0 && answered < applicableCount) return 'INCOMPLETE';
  if (score === null) return 'INCOMPLETE';
  return deficiencies.length === 0 ? 'COMPLIANT' : 'DEFICIENT';
}

/* ------------------------------------------------------------------ */
/* 4. CUSTODY RECONCILIATION                                           */
/* ------------------------------------------------------------------ */
const UNIT_TO_BASE = { m3: 1, cbm: 1, cubic_metre: 1, l: 0.001, litre: 0.001 };

function normaliseUnit(u) {
  return `${u || ''}`.trim().toLowerCase().replace(/\s+/g, '_');
}

function convertible(units) {
  const set = [...new Set(units.filter(Boolean).map(normaliseUnit))];
  if (set.length <= 1) return true;
  return set.every(u => Object.prototype.hasOwnProperty.call(UNIT_TO_BASE, u));
}

function toBase(qty, unit) {
  const f = UNIT_TO_BASE[normaliseUnit(unit)];
  return f === undefined ? null : Number(qty) * f;
}

/**
 * Reconcile the four recorded quantities of a waste consignment.
 *
 * The refusal to reconcile across unconvertible units (e.g. cubic metres
 * against tonnes, which would need a density the system does not hold) is
 * deliberate: producing a figure that appears authoritative and is not would
 * be worse than producing none. Verified by test case TC-17.
 */
export function reconcileCustody(declaration, note, events, tolerancePct = VARIANCE_TOLERANCE_PCT) {
  const byStage = new Map((events || []).map(e => [e.stage, e]));
  const collected = byStage.get('COLLECTED');
  const received = byStage.get('RECEIVED');

  if (!collected || !received) {
    return { variance_flag: 'INCOMPLETE', evaluated_at: new Date() };
  }

  const units = [
    declaration && declaration.quantity_unit,
    note && note.booked_quantity_unit,
    collected.quantity_unit,
    received.quantity_unit,
  ];
  if (!convertible(units)) {
    return { variance_flag: 'UNIT_MISMATCH', evaluated_at: new Date() };
  }

  const declared = declaration ? toBase(declaration.declared_quantity, declaration.quantity_unit) : null;
  const booked = note && note.booked_quantity != null
    ? toBase(note.booked_quantity, note.booked_quantity_unit) : null;
  const coll = toBase(collected.quantity, collected.quantity_unit);
  const recv = toBase(received.quantity, received.quantity_unit);

  if (declared === null || recv === null) {
    return { variance_flag: 'INCOMPLETE', evaluated_at: new Date() };
  }

  const variance = round3(recv - declared);
  const pct = declared === 0 ? null
    : Math.round(Math.abs(variance / declared) * 100 * 1000) / 1000;

  return {
    declared_quantity: round3(declared),
    booked_quantity: booked === null ? null : round3(booked),
    collected_quantity: coll === null ? null : round3(coll),
    received_quantity: round3(recv),
    variance_value: variance,
    variance_percent: pct,
    variance_flag: pct !== null && pct > tolerancePct ? 'BEYOND_TOLERANCE' : 'WITHIN_TOLERANCE',
    evaluated_at: new Date(),
  };
}

const round3 = n => Math.round(Number(n) * 1000) / 1000;
