/**
 * Test suite for the shared rule interpreter.
 * Each test is labelled with the Chapter Five test case it discharges,
 * so that the evidence trail runs from requirement to test to result.
 *
 * Run: node tests/rules.test.js
 */
'use strict';
const assert = require('assert');
const {
  isApplicable, evaluateCertificate, scoreInspection, reconcileCustody,
} = require('../shared/rules');

let pass = 0, fail = 0;
function t(id, name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${id}  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${id}  ${name}\n        ${e.message}`); }
}

const TANKER = { vessel_type: 'OIL_TANKER', grt: 50000, is_nigerian_flag: false };
const CARGO  = { vessel_type: 'GENERAL_CARGO', grt: 8000, is_nigerian_flag: true };

console.log('\nApplicability (FR-23)');
t('TC-06', 'tanker-only item is suppressed for a general cargo vessel', () => {
  const rule = { vessel_type: ['OIL_TANKER', 'CHEMICAL_TANKER'] };
  assert.strictEqual(isApplicable(rule, CARGO), false);
});
t('TC-07', 'the same item is presented for an oil tanker', () => {
  const rule = { vessel_type: ['OIL_TANKER', 'CHEMICAL_TANKER'] };
  assert.strictEqual(isApplicable(rule, TANKER), true);
});
t('TC-06b', 'null rule means always applicable', () => {
  assert.strictEqual(isApplicable(null, CARGO), true);
});
t('TC-06c', 'tonnage threshold is honoured', () => {
  assert.strictEqual(isApplicable({ grt: { gte: 400 } }, CARGO), true);
  assert.strictEqual(isApplicable({ grt: { gte: 400 } }, { grt: 120 }), false);
});
t('TC-06d', 'conjunction requires every clause', () => {
  const rule = { vessel_type: ['OIL_TANKER'], grt: { gte: 100000 } };
  assert.strictEqual(isApplicable(rule, TANKER), false);
});

console.log('\nCertificate expiry (FR-24)');
t('TC-08', 'certificate expiring before inspection is flagged EXPIRED', () => {
  const c = { sighted_state: 'YES', valid_until: '2026-01-15' };
  assert.strictEqual(evaluateCertificate(c, '2026-03-01'), 'EXPIRED');
});
t('TC-09', 'certificate inside the horizon is flagged EXPIRING_SOON', () => {
  const c = { sighted_state: 'YES', valid_until: '2026-03-20' };
  assert.strictEqual(evaluateCertificate(c, '2026-03-01'), 'EXPIRING_SOON');
});
t('TC-09b', 'certificate beyond the horizon is VALID', () => {
  const c = { sighted_state: 'YES', valid_until: '2027-01-01' };
  assert.strictEqual(evaluateCertificate(c, '2026-03-01'), 'VALID');
});
t('TC-09c', 'unsighted certificate is not evaluated for expiry', () => {
  assert.strictEqual(evaluateCertificate({ sighted_state: 'NO' }, '2026-03-01'), 'NOT_SIGHTED');
});
t('TC-09d', 'boundary: expiring on the inspection date is not yet expired', () => {
  const c = { sighted_state: 'YES', valid_until: '2026-03-01' };
  assert.strictEqual(evaluateCertificate(c, '2026-03-01'), 'EXPIRING_SOON');
});

console.log('\nWeighted scoring (FR-31)');
const ACTION = new Map([[1, { is_detention: false }], [17, { is_detention: true }]]);
const mkItems = () => ([
  { item_id: 'a', weight: 2, applicability_rule: null },
  { item_id: 'b', weight: 1, applicability_rule: null },
  { item_id: 'c', weight: 3, applicability_rule: { vessel_type: ['OIL_TANKER'] } },
]);

t('TC-11', 'all conforming yields 100 and COMPLIANT', () => {
  const items = mkItems();
  const r = new Map([
    ['a', { response_id: 'r1', response_state: 'CONFORMING' }],
    ['b', { response_id: 'r2', response_state: 'CONFORMING' }],
  ]);
  const out = scoreInspection(items, r, CARGO, { actionCodes: ACTION });
  assert.strictEqual(out.score, 100);
  assert.strictEqual(out.state, 'COMPLIANT');
  assert.strictEqual(out.deficiencies.length, 0);
});

t('TC-12', 'inapplicable items are excluded from the attainable total', () => {
  const items = mkItems();
  const r = new Map([
    ['a', { response_id: 'r1', response_state: 'CONFORMING' }],
    ['b', { response_id: 'r2', response_state: 'CONFORMING' }],
  ]);
  const out = scoreInspection(items, r, CARGO, { actionCodes: ACTION });
  // item 'c' (weight 3) applies only to tankers: attainable must be 3, not 6
  assert.strictEqual(out.attainable, 3, `attainable was ${out.attainable}`);
  assert.strictEqual(out.applicableCount, 2);
});

t('TC-10', 'a non-conforming response generates exactly one deficiency', () => {
  const items = mkItems();
  const r = new Map([
    ['a', { response_id: 'r1', response_state: 'NON_CONFORMING', action_code_id: 1 }],
    ['b', { response_id: 'r2', response_state: 'CONFORMING' }],
  ]);
  const out = scoreInspection(items, r, CARGO, { actionCodes: ACTION });
  assert.strictEqual(out.deficiencies.length, 1);
  assert.strictEqual(out.score, Math.round((1 / 3) * 10000) / 100);
  assert.strictEqual(out.state, 'DEFICIENT');
});

t('TC-13', 'a detainable deficiency governs the state despite a high score', () => {
  const items = [
    { item_id: 'a', weight: 20, applicability_rule: null },
    { item_id: 'b', weight: 1, applicability_rule: null },
  ];
  const r = new Map([
    ['a', { response_id: 'r1', response_state: 'CONFORMING' }],
    ['b', { response_id: 'r2', response_state: 'NON_CONFORMING', action_code_id: 17 }],
  ]);
  const out = scoreInspection(items, r, CARGO, { actionCodes: ACTION });
  assert.ok(out.score > 95, `score was ${out.score}`);
  assert.strictEqual(out.state, 'DETAINABLE');  // not offset by conformity elsewhere
});

t('TC-12b', 'an unanswered applicable item yields INCOMPLETE', () => {
  const items = mkItems();
  const r = new Map([['a', { response_id: 'r1', response_state: 'CONFORMING' }]]);
  const out = scoreInspection(items, r, CARGO, { actionCodes: ACTION });
  assert.strictEqual(out.state, 'INCOMPLETE');
});

console.log('\nCustody reconciliation (FR-42)');
const decl = { declared_quantity: 100, quantity_unit: 'CBM' };
const note = { booked_quantity: 100, booked_quantity_unit: 'CBM' };

t('TC-16', 'variance within tolerance is flagged WITHIN_TOLERANCE', () => {
  const ev = [
    { stage: 'COLLECTED', quantity: 98, quantity_unit: 'CBM' },
    { stage: 'RECEIVED', quantity: 96, quantity_unit: 'CBM' },
  ];
  const out = reconcileCustody(decl, note, ev);
  assert.strictEqual(out.variance_value, -4);
  assert.strictEqual(out.variance_percent, 4);
  assert.strictEqual(out.variance_flag, 'WITHIN_TOLERANCE');
});

t('TC-16b', 'variance beyond tolerance is flagged BEYOND_TOLERANCE', () => {
  const ev = [
    { stage: 'COLLECTED', quantity: 95, quantity_unit: 'CBM' },
    { stage: 'RECEIVED', quantity: 72, quantity_unit: 'CBM' },
  ];
  const out = reconcileCustody(decl, note, ev);
  assert.strictEqual(out.variance_flag, 'BEYOND_TOLERANCE');
  assert.strictEqual(out.received_quantity, 72);
  assert.strictEqual(out.declared_quantity, 100);
});

t('TC-17', 'unconvertible units are refused, not guessed', () => {
  const ev = [
    { stage: 'COLLECTED', quantity: 95, quantity_unit: 'CBM' },
    { stage: 'RECEIVED', quantity: 80, quantity_unit: 'TONNES' },
  ];
  const out = reconcileCustody(decl, note, ev);
  assert.strictEqual(out.variance_flag, 'UNIT_MISMATCH');
  assert.strictEqual(out.variance_value, undefined);
});

t('TC-16c', 'convertible units are normalised before comparison', () => {
  const ev = [
    { stage: 'COLLECTED', quantity: 100000, quantity_unit: 'L' },
    { stage: 'RECEIVED', quantity: 100000, quantity_unit: 'litre' },
  ];
  const out = reconcileCustody(decl, note, ev);
  assert.strictEqual(out.received_quantity, 100);   // 100000 L -> 100 m3
  assert.strictEqual(out.variance_flag, 'WITHIN_TOLERANCE');
});

t('TC-16d', 'an incomplete chain yields INCOMPLETE, not a variance', () => {
  const ev = [{ stage: 'COLLECTED', quantity: 95, quantity_unit: 'CBM' }];
  const out = reconcileCustody(decl, note, ev);
  assert.strictEqual(out.variance_flag, 'INCOMPLETE');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
