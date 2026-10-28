'use strict';
/**
 * End-to-end and database security suite for the MARPOL Compliance
 * Inspection System server.
 *
 * Run (from the project root, with the server already running and the
 * database already migrated and seeded):
 *
 *     node tests/e2e.test.js
 *
 * or, once wired into package.json (see E2E_SETUP_NOTE.md):
 *
 *     npm run test:e2e
 *
 * Environment variables:
 *   E2E_BASE_URL   base URL of the running server   (default http://localhost:4000)
 *   DATABASE_URL   superuser/owner connection, for setup only (default
 *                  postgresql://postgres:postgres@localhost:5432/marpol)
 *   APP_DATABASE_URL  the application's own (app_role) connection string,
 *                  used for the DB-level checks (TS-01, TS-05, SC-3e) —
 *                  this is deliberately the SAME credential the server
 *                  itself uses, taken from server/.env, not a superuser.
 *
 * ---------------------------------------------------------------------
 * RUNNING IT TWICE IN A ROW
 * ---------------------------------------------------------------------
 * TS-06 (the last scored scenario) deliberately exhausts app.js's
 * publicLimiter (100 requests / 15 minutes, per IP, on the /api/requests
 * prefix) to prove the rate limit actually triggers. That limiter's
 * counter lives in the server process's memory, keyed by IP, for the
 * full 15-minute window — so a SECOND run against the SAME still-running
 * server, from the same machine, within 15 minutes, will find the limiter
 * already tripped and every /api/requests call (including SC-1a's lodge)
 * will be refused with 429 from the very first scenario. This is the rate
 * limiter working correctly, not a flaw in this suite. Simply restart the
 * server (`node src/index.js`) before re-running — that clears the
 * in-memory counter — or wait 15 minutes. The database does NOT need to
 * be reset between runs; every fixture (vessel IMO numbers, staff emails)
 * is randomised per run specifically so the suite is safe to re-run
 * against data left over from a previous run.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT ASSUME
 * ---------------------------------------------------------------------
 * It uses only Node 22 built-ins (fetch, crypto, child_process) — no new
 * dependency is introduced at the project root. The handful of checks
 * that are explicitly about what the DATABASE itself enforces, rather
 * than what the API returns (TS-01, TS-05, SC-3e), shell out to the
 * `psql` client, which every setup in E2E_SETUP_NOTE.md already has
 * installed (it is how db:migrate / db:seed / db:verify already run).
 *
 * ---------------------------------------------------------------------
 * ADAPTATIONS FROM THE DOCUMENTED SCENARIO LIST (read before editing)
 * ---------------------------------------------------------------------
 * Every adaptation below was forced by reading the actual route code in
 * server/server/src/routes/*.js — not guessed. Each is also called out
 * inline, next to the step it affects.
 *
 * 1. SC-2e ("raise the waste note against the declaration and book
 *    collection") is NOT a separate manual action in the real code.
 *    inspections.js auto-creates the waste_collection_note and its
 *    BOOKED custody_event the moment a synchronised declaration has
 *    to_be_landed = true (see the "ADDED" comment block in
 *    routes/inspections.js). Calling POST /api/waste-notes manually
 *    afterwards for the SAME declaration_id would collide with that
 *    auto-created note (declaration_id is UNIQUE on
 *    waste_collection_note), so SC-2e here verifies the auto-booking
 *    instead of performing a redundant manual booking.
 *
 * 2. SC-3a ("receiver attests RECEIVED before collection has been
 *    recorded") now runs as originally documented: this file was first
 *    written while that check had a real bug (RECEIVED's ordering guard
 *    never fell back to checking COLLECTED). That bug has since been
 *    fixed in routes/waste.js, so SC-3a exercises the real scenario
 *    directly rather than the IN_TRANSIT-based workaround this file
 *    used while the bug was still open.
 *
 * 3. seed/03_content.sql (reference_content rows) was never uploaded and
 *    is NOT required for any of these 31 scenarios: routes/content.js
 *    (serving it) is pure read/list and degrades to an empty array with
 *    no seeded rows; nothing in the compliance, waste-custody, triage,
 *    or security scenarios touches reference_content at all.
 */

const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4000';
const SETUP_DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/marpol';
const APP_DATABASE_URL = process.env.APP_DATABASE_URL
  || 'postgresql://app_role:change-me-before-deployment@localhost:5432/marpol';

/* ----------------------------- ANSI colour, no dependency ----------------------------- */
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
const paint = (code, s) => `${code}${s}${RESET}`;

/* ----------------------------- tiny HTTP helper ----------------------------- */
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

/* ----------------------------- direct-database helper -----------------------------
 * Used ONLY for the handful of checks that are explicitly about what the
 * database itself enforces (credential storage, role privilege, a direct
 * bypass insert) rather than what the API returns. Shells out to psql,
 * which every setup in E2E_SETUP_NOTE.md already has installed; no new
 * dependency is introduced. */
function psql(connectionString, sql) {
  try {
    const out = execFileSync('psql', [connectionString, '-At', '-c', sql], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: out.trim() };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString().trim(), stderr: (e.stderr || e.message).toString().trim() };
  }
}

/* ----------------------------- test harness ----------------------------- */
let pass = 0, fail = 0;
const failures = [];

async function t(id, label, fn) {
  try {
    await fn();
    pass++;
    console.log(`${paint(GREEN, 'PASS')} ${id.padEnd(6)} ${label}`);
  } catch (e) {
    fail++;
    failures.push({ id, label, error: e });
    console.log(`${paint(RED, 'FAIL')} ${id.padEnd(6)} ${label}`);
    console.log(`       ${paint(RED, 'expected:')} ${e.expected !== undefined ? JSON.stringify(e.expected) : '(see message)'}`);
    console.log(`       ${paint(RED, 'observed:')} ${e.observed !== undefined ? JSON.stringify(e.observed) : '(see message)'}`);
    console.log(`       ${paint(DIM, e.message)}`);
  }
}

function assertEqual(observed, expected, message) {
  if (observed !== expected) {
    const err = new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(observed)}`);
    err.expected = expected; err.observed = observed;
    throw err;
  }
}
function assertTrue(cond, message, observed) {
  if (!cond) {
    const err = new Error(message || 'expected condition to be true');
    err.expected = true; err.observed = observed;
    throw err;
  }
}

/* ----------------------------- fixtures ----------------------------- */
const rand = (n) => crypto.randomBytes(n).toString('hex');
const randomImo = () => String(9000000 + Math.floor(Math.random() * 999999)).slice(0, 7);
const uniqueEmail = (role) => `${role.toLowerCase()}.${rand(3)}@test.gov.ng`;

const ctx = {}; // shared state threaded through the whole narrative


/* ============================================================================
 *  THE SUITE
 * ========================================================================== */
(async () => {
  console.log('');
  console.log(paint(BOLD, 'End-to-end and database security suite'));
  console.log(`$ node tests/e2e.test.js   # live API at ${BASE}, PostgreSQL, app_role\n`);

  /* -------------------------- bootstrap fixtures -------------------------- *
   * Not part of the 31 scored scenarios: creates the staff accounts the
   * scenarios below act as. Requires an ADMINISTRATOR account to already
   * exist (node scripts/bootstrap-admin.js — see E2E_SETUP_NOTE.md) and
   * its credentials in E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. */
  const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@test.gov.ng';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'SuperSecretPass123';

  const adminLogin = await api('POST', '/api/auth/login', { body: { email: adminEmail, password: adminPassword } });
  if (adminLogin.status !== 200) {
    console.error(paint(RED, `Cannot sign in as the administrator (${adminEmail}). Run:`));
    console.error('  node scripts/bootstrap-admin.js "E2E Admin" admin@test.gov.ng SuperSecretPass123');
    console.error('from server/server, then re-run this suite.');
    process.exit(1);
  }
  ctx.adminToken = adminLogin.body.token;

  async function createStaff(role) {
    const email = uniqueEmail(role);
    const password = 'TestPassword1234';
    const created = await api('POST', '/api/users', {
      token: ctx.adminToken,
      body: { full_name: `E2E ${role}`, email, password, role_name: role },
    });
    assertTrue(created.status === 201, `could not create a ${role} fixture account`, created.body);
    const login = await api('POST', '/api/auth/login', { body: { email, password } });
    assertTrue(login.status === 200, `could not sign in as the ${role} fixture`, login.body);
    return { email, password, token: login.body.token, userId: login.body.user.user_id };
  }

  ctx.officer = await createStaff('COMPLIANCE_OFFICER');
  ctx.supervisor = await createStaff('SUPERVISOR');
  ctx.leader = await createStaff('WASTE_TEAM_LEADER');
  ctx.receiver = await createStaff('FACILITY_RECEIVER');

  /* ======================================================================
   * SC-1 : a general cargo vessel, start to finish
   * ====================================================================== */

  await t('SC-1a', 'Lodge a portal request without an account', async () => {
    ctx.imo1 = randomImo();
    const r = await api('POST', '/api/requests', {
      body: {
        vessel_imo: ctx.imo1, vessel_name: 'MV GENERAL STAR', vessel_type: 'GENERAL_CARGO',
        gross_tonnage: 8000, flag_state: 'Panama', port: 'Lagos', berth: 'Apapa 4',
        agent_name: 'Delta Shipping Agency', agent_email: 'agent1@example.com',
        has_waste_to_land: false, channel: 'PORTAL',
      },
    });
    assertEqual(r.status, 201, 'expected the public intake to accept a well-formed request');
    assertTrue(!!r.body.request_reference, 'expected a request_reference to be allocated', r.body);
    assertEqual(r.body.status, 'SUBMITTED', 'a freshly lodged request should start SUBMITTED', r.body.status);
    ctx.request1 = r.body;
  });

  await t('TS-07', 'Track a request by reference; inspect the fields disclosed', async () => {
    const r = await api('GET', `/api/requests/${ctx.request1.request_reference}`);
    assertEqual(r.status, 200, 'expected tracking by reference to succeed, unauthenticated');
    const allowed = new Set(['request_reference', 'vessel_name', 'port', 'status', 'submitted_at', 'decline_reason', 'converted']);
    const disclosed = Object.keys(r.body);
    const leaked = disclosed.filter(k => !allowed.has(k));
    assertTrue(leaked.length === 0,
      `tracking disclosed field(s) beyond the narrow public set: ${leaked.join(', ')}`, disclosed);
    // Most importantly: no agent contact details, no internal ids.
    assertTrue(r.body.agent_email === undefined && r.body.request_id === undefined,
      'tracking must not disclose agent contact details or internal identifiers', r.body);
  });

  await t('SC-1b', 'Officer triages the request into a compliance case', async () => {
    const r = await api('POST', `/api/requests/${ctx.request1.request_id}/triage`, { token: ctx.officer.token });
    assertEqual(r.status, 201, 'expected triage of a fresh SUBMITTED request to succeed', r.body);
    assertTrue(!!r.body.case_id, 'expected a compliance_case to be returned', r.body);
    ctx.case1 = r.body;
  });

  await t('SC-1c', 'Triage the same request a second time', async () => {
    const r = await api('POST', `/api/requests/${ctx.request1.request_id}/triage`, { token: ctx.officer.token });
    assertEqual(r.status, 409, 'a request already converted must be refused a second triage', r.body);
    assertEqual(r.body.case_id, ctx.case1.case_id, 'the conflict should name the existing case');
  });

  await t('SC-1d', 'Synchronise a fully conforming inspection of a general cargo vessel', async () => {
    const instr = await api('GET', '/api/instrument/active', { token: ctx.officer.token });
    assertEqual(instr.status, 200, 'expected the active instrument pack to be retrievable');
    ctx.template = instr.body.template;
    ctx.items = instr.body.items;
    ctx.deficiencyCodes = instr.body.vocabularies.deficiency_codes;
    ctx.actionCodes = instr.body.vocabularies.action_codes;

    const responses = ctx.items.map(it => ({ item_id: it.item_id, response_state: 'CONFORMING' }));
    const r = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token,
      body: {
        case_id: ctx.case1.case_id, template_id: ctx.template.template_id,
        template_version: ctx.template.version, base_version: null,
        inspection_date: '2026-09-01', voyage_no: 'V-001', agent: 'Delta Shipping Agency',
        master_name: 'Capt. A. Johnson',
        responses, certificates: [], declarations: [], signatories: [],
      },
    });
    assertEqual(r.status, 201, 'expected the first synchronisation of a case to be accepted', r.body);
    assertEqual(r.body.outcome, 'ACCEPTED');
    assertEqual(r.body.compliance_state, 'COMPLIANT', 'all-CONFORMING responses should score COMPLIANT', r.body);
    assertEqual(r.body.deficiencies, 0);
    ctx.inspection1 = r.body;
  });

  await t('SC-1e', 'Applicable item count computed from the vessel record', async () => {
    assertTrue(ctx.inspection1.applicable_items > 0,
      'expected a positive applicable item count for a general cargo vessel', ctx.inspection1.applicable_items);
    ctx.generalCargoApplicable = ctx.inspection1.applicable_items;
  });

  await t('SC-1h', 'Inspected case leaves the officer work queue', async () => {
    const r = await api('GET', '/api/cases', { token: ctx.officer.token });
    assertEqual(r.status, 200);
    const stillThere = r.body.some(c => c.case_id === ctx.case1.case_id);
    assertTrue(!stillThere, 'a case with a recorded inspection should no longer be "awaiting attendance"', r.body.map(c => c.case_id));
  });

  await t('SC-1f', 'Request the definitive report before supervisory approval', async () => {
    const r = await api('POST', `/api/inspections/${ctx.inspection1.inspection_id}/report`, { token: ctx.supervisor.token });
    assertEqual(r.status, 409, 'an unapproved inspection must not yield a definitive report', r.body);
    assertEqual(r.body.reason, 'AWAITING_APPROVAL');
  });

  await t('SC-1g', 'Approve, generate and download the definitive MCI report', async () => {
    const approve = await api('POST', `/api/inspections/${ctx.inspection1.inspection_id}/approve`,
      { token: ctx.supervisor.token, body: { approve: true } });
    assertEqual(approve.status, 200, 'expected supervisory approval to succeed', approve.body);

    const gen = await api('POST', `/api/inspections/${ctx.inspection1.inspection_id}/report`, { token: ctx.supervisor.token });
    assertEqual(gen.status, 201, 'expected report generation to succeed once approved', gen.body);
    assertTrue(!!gen.body.download, 'expected a download path', gen.body);

    const dl = await fetch(BASE + gen.body.download, { headers: { Authorization: `Bearer ${ctx.supervisor.token}` } });
    assertEqual(dl.status, 200, 'expected the PDF to download');
    assertTrue((dl.headers.get('content-type') || '').includes('application/pdf'),
      'expected a PDF content-type', dl.headers.get('content-type'));
    const buf = Buffer.from(await dl.arrayBuffer());
    assertTrue(buf.slice(0, 4).toString('latin1') === '%PDF', 'expected a well-formed PDF file signature', buf.slice(0, 8).toString('latin1'));
  });

  /* ======================================================================
   * SC-2 : a tanker, with deficiencies and a waste declaration
   * ====================================================================== */

  await t('SC-2a', 'Synchronise a tanker inspection with three deficiencies, one detainable', async () => {
    ctx.imo2 = randomImo();
    const lodge = await api('POST', '/api/requests', {
      body: {
        vessel_imo: ctx.imo2, vessel_name: 'MV CRUDE VOYAGER', vessel_type: 'OIL_TANKER',
        gross_tonnage: 50000, flag_state: 'Liberia', port: 'Lagos', berth: 'Bonny Terminal 2',
        agent_name: 'Delta Shipping Agency', agent_email: 'agent2@example.com',
        has_waste_to_land: true, channel: 'PORTAL',
      },
    });
    assertEqual(lodge.status, 201);
    const triage = await api('POST', `/api/requests/${lodge.body.request_id}/triage`, { token: ctx.officer.token });
    assertEqual(triage.status, 201);
    ctx.case2 = triage.body;

    const byCode = code => ctx.items.find(i => i.item_code === code);
    const defCode = code => ctx.deficiencyCodes.find(d => d.code === code).code_id;
    const actCode = code => ctx.actionCodes.find(a => a.code === code).action_id;

    const nonConforming = [
      { item: byCode('I-01'), deficiency_code_id: defCode('01101'), action_code_id: actCode('17') },  // non-detainable
      { item: byCode('I-06'), deficiency_code_id: defCode('01104'), action_code_id: actCode('16') },  // non-detainable
      { item: byCode('I-07'), deficiency_code_id: defCode('01105'), action_code_id: actCode('30') },  // DETAINABLE
    ];
    const ncIds = new Set(nonConforming.map(n => n.item.item_id));

    const responses = ctx.items.map(it => {
      const nc = nonConforming.find(n => n.item.item_id === it.item_id);
      return nc
        ? { item_id: it.item_id, response_state: 'NON_CONFORMING', deficiency_code_id: nc.deficiency_code_id, action_code_id: nc.action_code_id, remark: 'Observed during inspection.' }
        : { item_id: it.item_id, response_state: 'CONFORMING' };
    });

    const r = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token,
      body: {
        case_id: ctx.case2.case_id, template_id: ctx.template.template_id,
        template_version: ctx.template.version, base_version: null,
        inspection_date: '2026-09-15', voyage_no: 'V-TK-77', master_name: 'Capt. B. Edwards',
        responses,
        certificates: [{ certificate_type: 'IOPP', sighted_state: 'YES', valid_until: '2026-01-01', issued_by: 'Flag State' }],
        declarations: [{ annex_code: 'I', waste_type: 'OILY_WASTE', to_be_landed: true, declared_quantity: 12.0, quantity_unit: 'CBM' }],
        signatories: [],
      },
    });
    assertEqual(r.status, 201, 'expected the tanker synchronisation to be accepted', r.body);
    assertEqual(r.body.deficiencies, 3, 'expected exactly three deficiencies to be raised', r.body);
    assertEqual(r.body.compliance_state, 'DETAINABLE', 'a detainable action code must govern the outcome', r.body);
    ctx.inspection2 = r.body;
  });

  await t('SC-2b', 'Applicable item count differs for the tanker', async () => {
    assertTrue(ctx.inspection2.applicable_items > ctx.generalCargoApplicable,
      `expected the tanker (OIL_TANKER-specific items included) to have MORE applicable items than general cargo (${ctx.generalCargoApplicable})`,
      ctx.inspection2.applicable_items);
  });

  await t('SC-2c', 'Certificate expiry determined by the server on synchronisation', async () => {
    const q = psql(APP_DATABASE_URL,
      `SELECT expiry_flag FROM certificate WHERE inspection_id='${ctx.inspection2.inspection_id}' AND certificate_type='IOPP';`);
    assertTrue(q.ok, 'expected the direct database check to succeed', q.stderr);
    assertEqual(q.stdout, 'EXPIRED', 'a certificate valid_until before the inspection date must be flagged EXPIRED by the server, not the device');
  });

  await t('SC-2d', 'Deficiencies persisted with codes from the controlled vocabulary', async () => {
    const q = psql(APP_DATABASE_URL, `
      SELECT dc.code || ':' || ac.code
      FROM deficiency d
      JOIN deficiency_code dc ON dc.code_id = d.code_id
      JOIN action_code ac ON ac.action_id = d.action_id
      WHERE d.inspection_id='${ctx.inspection2.inspection_id}'
      ORDER BY dc.code;`);
    assertTrue(q.ok, 'expected the direct database check to succeed', q.stderr);
    const rows = q.stdout.split('\n').filter(Boolean);
    assertEqual(rows.length, 3, 'expected three deficiency rows, each a foreign key into the controlled vocabulary', rows);
    assertTrue(rows.includes('01105:30'), 'expected the detainable deficiency/action pairing to be persisted', rows);
  });

  await t('SC-2e', 'Waste declared for landing is auto-booked as a collection note (Section A)', async () => {
    /* ADAPTED — see file header note 1. The real code books Section A
     * automatically on sync, rather than through a later manual call. */
    const q = await api('GET', '/api/waste-notes', { token: ctx.leader.token });
    assertEqual(q.status, 200);
    const note = q.body.find(n => n.imo_number === ctx.imo2);
    assertTrue(!!note, 'expected a waste_collection_note booked from the synchronised declaration to appear in the team leader queue', q.body);
    assertEqual(note.custody_stage, 'BOOKED', 'a freshly booked note should be at stage BOOKED', note);
    ctx.wcn = note;
  });

  /* ======================================================================
   * SC-3 : the custody chain
   * ====================================================================== */

  await t('SC-3a', 'Receiver attests RECEIVED before collection has been recorded', async () => {
    const r = await api('POST', `/api/waste-notes/${ctx.wcn.wcn_id}/custody`, {
      token: ctx.receiver.token, body: { stage: 'RECEIVED', quantity: 12, quantity_unit: 'CBM' },
    });
    assertEqual(r.status, 409, 'RECEIVED attested before COLLECTED must be rejected as out of sequence', r.body);
    assertEqual(r.body.reason, 'MISSING_PREDECESSOR');
    assertEqual(r.body.required, 'COLLECTED');
  });

  await t('SC-3b', 'Waste team leader attempts to attest RECEIVED', async () => {
    const r = await api('POST', `/api/waste-notes/${ctx.wcn.wcn_id}/custody`, {
      token: ctx.leader.token, body: { stage: 'RECEIVED', quantity: 9, quantity_unit: 'CBM' },
    });
    assertEqual(r.status, 403, 'a team leader must not be able to attest the RECEIVED stage', r.body);
  });

  await t('SC-3c', 'Team leader attests COLLECTED (Section B)', async () => {
    const r = await api('POST', `/api/waste-notes/${ctx.wcn.wcn_id}/custody`, {
      token: ctx.leader.token, body: { stage: 'COLLECTED', quantity: 12, quantity_unit: 'CBM', signatory_name: 'J. Okafor' },
    });
    assertEqual(r.status, 201, 'expected the correctly-scoped COLLECTED attestation to succeed', r.body);
  });

  await t('SC-3d', 'Attest COLLECTED a second time', async () => {
    const r = await api('POST', `/api/waste-notes/${ctx.wcn.wcn_id}/custody`, {
      token: ctx.leader.token, body: { stage: 'COLLECTED', quantity: 12, quantity_unit: 'CBM' },
    });
    assertEqual(r.status, 409, 'a stage already attested must not be attested again', r.body);
    assertEqual(r.body.reason, 'DUPLICATE_STAGE');
  });

  await t('SC-3e', 'Bypass the application and insert a duplicate stage directly in the database', async () => {
    const sql = `INSERT INTO custody_event (wcn_id, stage, occurred_at, quantity, quantity_unit)
                 VALUES ('${ctx.wcn.wcn_id}', 'COLLECTED', now(), 12, 'CBM');`;
    const q = psql(APP_DATABASE_URL, sql);
    assertTrue(!q.ok, 'a direct INSERT duplicating (wcn_id, stage) must be refused by the schema, not just by application code', q.stdout);
    assertTrue(/uq_custody_stage|duplicate key value violates unique constraint/i.test(q.stderr),
      'expected the uq_custody_stage UNIQUE constraint to be the cause of the refusal', q.stderr);
  });

  await t('SC-3f', 'Receiver attests RECEIVED 9.0 m3 against 12.0 m3 declared (Sections C and D)', async () => {
    const r = await api('POST', `/api/waste-notes/${ctx.wcn.wcn_id}/custody`, {
      token: ctx.receiver.token, body: { stage: 'RECEIVED', quantity: 9.0, quantity_unit: 'CBM', signatory_name: 'E. Bassey' },
    });
    assertEqual(r.status, 201, 'expected the correctly-scoped RECEIVED attestation to succeed', r.body);
    assertTrue(!!r.body.reconciliation, 'expected reconciliation to be computed on receipt', r.body);
    assertEqual(r.body.reconciliation.variance_flag, 'BEYOND_TOLERANCE',
      'a 3.0 m3 shortfall against 12.0 declared (25%) must exceed tolerance', r.body.reconciliation);
    ctx.reconciliation = r.body.reconciliation;
  });

  await t('SC-3g', 'Variance appears in the supervisory review queue', async () => {
    const r = await api('GET', '/api/reconciliations/variances', { token: ctx.supervisor.token });
    assertEqual(r.status, 200);
    const present = r.body.some(v => v.wcn_id === ctx.wcn.wcn_id);
    assertTrue(present, 'expected the beyond-tolerance consignment to appear in the supervisory variance queue', r.body.map(v => v.wcn_id));
  });

  await t('SC-3h', 'Download the controlled waste collection note', async () => {
    const r = await fetch(BASE + `/api/waste-notes/${ctx.wcn.wcn_id}/note.pdf`, { headers: { Authorization: `Bearer ${ctx.receiver.token}` } });
    assertEqual(r.status, 200, 'expected the receiver to be able to download the note they signed');
    assertTrue((r.headers.get('content-type') || '').includes('application/pdf'), 'expected a PDF content-type');
    const buf = Buffer.from(await r.arrayBuffer());
    assertTrue(buf.slice(0, 4).toString('latin1') === '%PDF', 'expected a well-formed PDF file signature');
  });

  /* ======================================================================
   * SC-2f : corrective action
   * ====================================================================== */

  await t('SC-2f', 'Operator submits corrective action; supervisor verifies closure', async () => {
    const dq = psql(APP_DATABASE_URL,
      `SELECT d.deficiency_id FROM deficiency d
         JOIN deficiency_code dc ON dc.code_id = d.code_id
        WHERE d.inspection_id='${ctx.inspection2.inspection_id}' AND dc.code='01104';`);
    assertTrue(dq.ok && dq.stdout, 'setup: expected to find the I-06 deficiency to close', dq);

    const submit = await api('POST', '/api/corrective-action', {
      body: {
        mci_number: String(ctx.inspection2.mci_number), deficiency_code: '01104',
        action_taken: 'Oily water separator overhauled and tested; recalibrated to the 15 ppm standard.',
        contact: 'chief.engineer@mvcrudevoyager.example',
      },
    });
    assertEqual(submit.status, 201, 'expected the public corrective-action submission to be accepted', submit.body);

    const queue = await api('GET', '/api/corrective-actions', { token: ctx.supervisor.token });
    assertEqual(queue.status, 200);
    const item = queue.body.find(x => x.ca_id === submit.body.ca_id);
    assertTrue(!!item, 'expected the submission to appear in the supervisory verification queue', queue.body.map(x => x.ca_id));

    const verify = await api('POST', `/api/corrective-actions/${submit.body.ca_id}/verify`, {
      token: ctx.supervisor.token, body: { accept: true, outcome: 'Re-inspected ashore; separator now compliant.' },
    });
    assertEqual(verify.status, 200, 'expected verification to succeed', verify.body);
    assertEqual(verify.body.status, 'CLOSED', 'a verified-and-accepted corrective action should close the deficiency', verify.body);
  });

  /* ======================================================================
   * TO : synchronisation protocol
   * ====================================================================== */

  await t('TO-09', 'Retransmit a record the server has already accepted', async () => {
    const responses = ctx.items.map(it => ({ item_id: it.item_id, response_state: 'CONFORMING' }));
    const payload = {
      case_id: ctx.case1.case_id, template_id: ctx.template.template_id,
      template_version: ctx.template.version, base_version: 1,
      inspection_date: '2026-09-01', voyage_no: 'V-001', agent: 'Delta Shipping Agency',
      master_name: 'Capt. A. Johnson', responses, certificates: [], declarations: [], signatories: [],
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(responses)).digest('hex');
    const r = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token, body: { ...payload, payload_hash: hash },
    });
    assertEqual(r.status, 200, 'an identical retransmission must be discarded, not re-applied', r.body);
    assertEqual(r.body.outcome, 'DUPLICATE_DISCARDED');
    assertEqual(r.body.inspection_id, ctx.inspection1.inspection_id);
  });

  await t('TO-10', 'Synchronise a divergent version whose base the server has advanced beyond', async () => {
    // First, a genuine second edit (different payload, correct base_version)
    // so the server's record_version actually advances past 1.
    const editedResponses = ctx.items.map((it, i) => ({
      item_id: it.item_id, response_state: 'CONFORMING',
      remark: i === 0 ? 'Master confirmed arrangement at second visit.' : undefined,
    }));
    const advance = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token,
      body: {
        case_id: ctx.case1.case_id, template_id: ctx.template.template_id,
        template_version: ctx.template.version, base_version: 1,
        inspection_date: '2026-09-01', voyage_no: 'V-001', agent: 'Delta Shipping Agency',
        master_name: 'Capt. A. Johnson', responses: editedResponses, certificates: [], declarations: [], signatories: [],
      },
    });
    assertEqual(advance.status, 201, 'setup: expected the genuine edit to be accepted and the version to advance', advance.body);
    assertTrue(advance.body.record_version > 1, 'setup: expected record_version to have advanced', advance.body);

    // Now a device that is still on base_version 1 — stale — tries to sync
    // a THIRD, divergent payload. The server must refuse rather than
    // silently overwrite the edit it already has.
    const staleResponses = ctx.items.map(it => ({ item_id: it.item_id, response_state: 'CONFORMING', remark: 'Stale device copy.' }));
    const r = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token,
      body: {
        case_id: ctx.case1.case_id, template_id: ctx.template.template_id,
        template_version: ctx.template.version, base_version: 1,
        inspection_date: '2026-09-01', voyage_no: 'V-001', agent: 'Delta Shipping Agency',
        master_name: 'Capt. A. Johnson', responses: staleResponses, certificates: [], declarations: [], signatories: [],
      },
    });
    assertEqual(r.status, 409, 'a stale base_version with a genuinely different payload must be refused', r.body);
    assertEqual(r.body.reason, 'SERVER_AHEAD');
  });

  /* ======================================================================
   * TS : security
   * ====================================================================== */

  await t('TS-01', 'Inspect the stored representation of a credential', async () => {
    const q = psql(APP_DATABASE_URL, `SELECT password_hash FROM app_user WHERE email='${ctx.officer.email}';`);
    assertTrue(q.ok, 'expected the direct database check to succeed', q.stderr);
    assertTrue(q.stdout.startsWith('$argon2id$'), 'expected an Argon2id hash, not plaintext or a reversible encoding', q.stdout);
    assertTrue(q.stdout !== ctx.officer.password, 'the stored value must not equal the plaintext password');
  });

  await t('TS-05', 'As the application role, attempt to UPDATE and DELETE an audit entry', async () => {
    const upd = psql(APP_DATABASE_URL, `UPDATE audit_log SET action='TAMPERED' WHERE log_id = (SELECT min(log_id) FROM audit_log);`);
    assertTrue(!upd.ok, 'app_role must not be able to UPDATE audit_log', upd.stdout);
    assertTrue(/permission denied/i.test(upd.stderr), 'expected a permission-denied error on UPDATE', upd.stderr);

    const del = psql(APP_DATABASE_URL, `DELETE FROM audit_log WHERE log_id = (SELECT min(log_id) FROM audit_log);`);
    assertTrue(!del.ok, 'app_role must not be able to DELETE from audit_log', del.stdout);
    assertTrue(/permission denied/i.test(del.stderr), 'expected a permission-denied error on DELETE', del.stderr);
  });

  await t('TS-09', 'Submit a failed authentication attempt', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: ctx.officer.email, password: 'definitely-the-wrong-password' } });
    assertEqual(r.status, 401, 'a bad password must be refused');
    const q = psql(SETUP_DATABASE_URL,
      `SELECT count(*) FROM login_attempt WHERE email_attempted='${ctx.officer.email}' AND succeeded=false;`);
    assertTrue(q.ok && Number(q.stdout) >= 1, 'expected the failed attempt to be recorded in login_attempt', q);
  });

  await t('TS-08', 'Authenticate with an account that does not exist', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: 'nobody.at.all@example.com', password: 'whatever-password' } });
    assertEqual(r.status, 401, 'a non-existent account must be refused');
    assertEqual(r.body.error, 'invalid credentials', 'the message must not disclose that the account does not exist (account enumeration)');
  });

  await t('TO-08', 'Synchronise a record captured against a superseded instrument version', async () => {
    const newVer = await api('POST', `/api/admin/instruments/${ctx.template.template_id}/new-version`, { token: ctx.adminToken });
    assertEqual(newVer.status, 201, 'setup: expected a new instrument version to be published', newVer.body);
    const activate = await api('POST', `/api/admin/instruments/${newVer.body.template_id}/activate`, { token: ctx.adminToken });
    assertEqual(activate.status, 200, 'setup: expected the new version to activate (retiring the one in use)', activate.body);

    const responses = ctx.items.map(it => ({ item_id: it.item_id, response_state: 'CONFORMING' }));
    const r = await api('POST', '/api/inspections/sync', {
      token: ctx.officer.token,
      body: {
        case_id: ctx.case2.case_id, template_id: ctx.template.template_id,  // the now-RETIRED version
        template_version: ctx.template.version, base_version: null,
        inspection_date: '2026-09-20', responses, certificates: [], declarations: [], signatories: [],
      },
    });
    assertEqual(r.status, 409, 'a device still carrying a retired instrument version must be refused', r.body);
    assertEqual(r.body.reason, 'RETIRED_TEMPLATE');
  });
  await t('TS-06', 'Issue repeated unauthenticated tracking lookups from one address', async () => {
    // publicLimiter: 100 requests / 15 min on the /api/requests prefix
    // (app.js). This process has already made a handful of calls under
    // that prefix (SC-1a/b/c, SC-2a, TO-*); push the remainder over 100.
    let lastStatus = 200;
    let i = 0;
    for (; i < 130 && lastStatus !== 429; i++) {
      const r = await api('GET', `/api/requests/NO-SUCH-REFERENCE-${i}`);
      lastStatus = r.status;
    }
    assertEqual(lastStatus, 429, `expected the rate limiter to trigger within 130 further requests (stopped after ${i})`);
  });

  /* ======================================================================
   * SUMMARY
   * ====================================================================== */
  console.log('');
  const summary = `${pass} passed, ${fail} failed`;
  console.log(fail === 0 ? paint(GREEN, summary) : paint(RED, summary));


  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error(paint(RED, 'the suite itself threw before completing:'));
  console.error(e);
  process.exit(1);
});
