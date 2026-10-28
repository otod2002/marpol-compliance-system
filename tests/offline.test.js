'use strict';
/**
 * Offline and synchronisation suite for the MARPOL field PWA (the client/
 * React application built with Dexie/IndexedDB and vite-plugin-pwa).
 *
 * This drives a REAL, production-built copy of the client in REAL headless
 * Chromium (via Playwright), with the network actually switched off through
 * Playwright's `browserContext.setOffline(true)` — not a mock, not a
 * stubbed fetch — against the REAL server and REAL PostgreSQL database.
 *
 * Run (from the project root):
 *
 *     npm run test:offline
 *
 * which builds client/ for production, starts `vite preview` to serve that
 * build as plain static files, runs this file, then shuts the preview
 * server down again. The API SERVER must already be running separately
 * (same convention tests/e2e.test.js already uses) — see
 * OFFLINE_SETUP_NOTE.md.
 *
 * Environment variables:
 *   E2E_BASE_URL       base URL of the running API server (default http://localhost:4000)
 *   CLIENT_URL         base URL the production client is served from
 *                       (default http://localhost:5174 — see scripts/run-offline-tests.js)
 *   E2E_ADMIN_EMAIL     an existing ADMINISTRATOR account's email
 *                       (default admin@test.gov.ng, matching E2E_SETUP_NOTE.md)
 *   E2E_ADMIN_PASSWORD  that account's password (default SuperSecretPass123)
 *   DATABASE_URL        superuser/owner connection, for the one direct-DB
 *                       check this file makes (that an evidence photograph
 *                       really reached the inspection_response row) —
 *                       default postgresql://postgres:postgres@localhost:5432/marpol
 *
 * ---------------------------------------------------------------------
 * WHERE PLAYWRIGHT LIVES AS A DEPENDENCY, AND WHY
 * ---------------------------------------------------------------------
 * `playwright` is a devDependency of the PROJECT ROOT (next to where
 * tests/e2e.test.js and tests/rules.test.js already run from), not of
 * client/. Two reasons:
 *   1. This suite's own job is to launch a browser and act as a human
 *      using the already-built client — that is a root-level test
 *      concern, exactly like e2e.test.js's job of acting as an HTTP
 *      client against the already-running server. Neither belongs
 *      inside the thing it is testing.
 *   2. client/'s own package.json is the PWA's actual dependency list
 *      (Dexie, React, vite-plugin-pwa, …). Adding a full browser
 *      automation library there would ship test tooling as part of
 *      what that package implies gets built/installed for the product
 *      itself, even though nothing in client/src ever imports it.
 * No browser is downloaded by this project: Playwright is told to use
 * the Chromium that is already on the machine (see OFFLINE_SETUP_NOTE.md
 * for what happens on a normal install, which is different).
 *
 * ---------------------------------------------------------------------
 * ADAPTATIONS FROM THE DOCUMENTED SCENARIO LIST (read before editing)
 * ---------------------------------------------------------------------
 * Every adaptation below was forced by actually reading client/src and
 * trying the real behaviour in a real browser — not guessed.
 *
 * 1. TO-01 ("Installability of the field client as assessed by
 *    Chromium") does NOT wait for the `beforeinstallprompt` event and
 *    does NOT treat its absence as a failure. Confirmed live: Chromium
 *    only fires that event once its own engagement heuristics are
 *    satisfied (meaningful user interaction, not just a page load), and
 *    it does not fire at all under this kind of scripted, single-visit,
 *    headless automation — this was verified directly against the real
 *    build before writing the assertion. `beforeinstallprompt` firing is
 *    therefore a UX convenience signal layered on top of installability,
 *    not the installability determination itself, and asserting on it
 *    here would either hang forever or silently pass for the wrong
 *    reason. What TO-01 asserts instead is the real, necessary pair of
 *    conditions Chromium's own installability check is built from, and
 *    that this suite can observe directly: (a) the manifest Chromium
 *    actually fetches and parses is well-formed per the installability
 *    spec (name, start_url, display: standalone, and both a 192px and a
 *    512px icon), and (b) the service worker vite-plugin-pwa generated
 *    is registered and has taken control of the page (`reg.active` is
 *    set). Together these are exactly what FR-26's own code comment in
 *    vite.config.js claims ("the service worker precaches the
 *    application shell, so the client launches with no network at
 *    all") and what TO-02 then goes on to exercise for real.
 *
 * 2. TO-11 ("Device storage above 80 per cent … quota overridden on the
 *    page") was originally driven through the real Chrome DevTools
 *    Protocol method `Storage.overrideQuotaForOrigin` (via
 *    `context.newCDPSession`), which shrinks the ORIGIN'S real quota to
 *    just above its current real usage. That worked in this project's own
 *    development environment, but verification against a real end-user
 *    machine showed the command being accepted without error yet having
 *    no effect — `navigator.storage.estimate().quota` stayed at the real
 *    multi-gigabyte device quota across a 30-second poll, confirmed by
 *    diagnostic output rather than assumed, so this is a documented
 *    Chrome build/environment incompatibility with that specific command,
 *    not a timing issue and not a defect in the application.
 *
 *    The scenario now sets the tightened quota directly on the page by
 *    replacing `navigator.storage.estimate` with a wrapper that calls the
 *    real browser implementation and substitutes only the `quota` field
 *    in its result. Real device usage (IndexedDB + caches + service
 *    worker, still read live from the real browser API) is untouched.
 *    Because this is the exact same function both the test and the
 *    client's own `storageEstimate()` in `client/src/db.js` call, the
 *    application's own warning banner ("Device storage is NN% used…",
 *    Inspection.jsx) still renders from a real, consistent reading, not a
 *    separately faked one — only the one number Chrome's own DevTools
 *    command proved unreliable at setting is substituted, and the override
 *    is removed again at the end of the scenario.
 *
 * 3. TO-02 and TO-05 ("relaunch"/"close and relaunch") do not close and
 *    reopen the whole browser, which would discard the origin's
 *    IndexedDB and service-worker storage along with it (Playwright
 *    gives each `browserContext` its own storage partition, and a
 *    non-persistent context's storage does not survive the context
 *    being closed). What genuinely reproduces "close the app and open
 *    it again" on a real device — the storage partition surviving while
 *    the process/tab goes away — is closing the Playwright PAGE and
 *    opening a new page in the SAME context. That is what both
 *    scenarios do, with the context already offline throughout.
 *
 * 4. All ten scenarios run as ONE continuous narrative against ONE
 *    inspection, threaded through `ctx`, the same way SC-1 through SC-5
 *    thread through tests/e2e.test.js — a single vessel is boarded,
 *    inspected, signed and synchronised with one photograph attached,
 *    because that is the actual order these things happen in on a real
 *    boarding and it is also how the documented 10-line output reads
 *    (TO-02 through TO-12 in attendance order, then TS-11 at sign-out).
 */

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:4000';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
const SETUP_DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/marpol';

/* ----------------------------- ANSI colour, no dependency ----------------------------- */
/* Deliberately the same palette/helper as tests/e2e.test.js, so a person
 * comparing the two terminal screenshots sees the same look. */
const GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
const paint = (code, s) => `${code}${s}${RESET}`;

/* ----------------------------- tiny API helper (fetch, Node 22 built-in) ----------------------------- */
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

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

/* ----------------------------- test harness (same shape as e2e.test.js) ----------------------------- */
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
const crypto = require('crypto');
const rand = n => crypto.randomBytes(n).toString('hex');
const randomImo = () => String(9000000 + Math.floor(Math.random() * 999999)).slice(0, 7);

/* ----------------------------- small helpers against the live page ----------------------------- */

/** Read one Dexie object store's rows straight out of the real IndexedDB —
 * not an assumption about what the app did, the actual persisted data. */
function readStore(storeName) {
  return (page) => page.evaluate((name) => new Promise((resolve, reject) => {
    const req = indexedDB.open('marpol-field');
    req.onerror = () => reject(new Error('could not open marpol-field IndexedDB'));
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(name, 'readonly');
      const out = [];
      tx.objectStore(name).openCursor().onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (cursor) { out.push(cursor.value); cursor.continue(); } else resolve(out);
      };
      tx.onerror = () => reject(new Error(`cursor over ${name} failed`));
    };
  }), storeName);
}
const readInspections = readStore('inspections');
const readEvidence = readStore('evidence');
const readQueue = readStore('queue');
const readSession = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('marpol-field');
  req.onerror = () => reject(new Error('could not open marpol-field IndexedDB'));
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('session', 'readonly');
    const g = tx.objectStore('session').get('current');
    g.onsuccess = () => resolve(g.result || null);
    g.onerror = () => reject(new Error('session read failed'));
  };
}));

async function waitFor(fn, { timeout = 15000, interval = 250, label } = {}) {
  const start = Date.now();
  let lastErr;
  let lastValue;
  let attempts = 0;
  while (Date.now() - start < timeout) {
    attempts += 1;
    try {
      const v = await fn();
      if (v) return v;
      lastValue = v;
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, interval));
  }
  const elapsed = Date.now() - start;
  const what = label ? ` (${label})` : '';
  if (lastErr) {
    lastErr.message = `condition never became true within timeout${what} — ${attempts} attempts over ${elapsed}ms, last error: ${lastErr.message}`;
    throw lastErr;
  }
  throw new Error(`condition never became true within timeout${what} — ${attempts} attempts over ${elapsed}ms, last observed value: ${JSON.stringify(lastValue)}`);
}

/* ============================================================================
 *  THE SUITE
 * ========================================================================== */
(async () => {
  console.log('');
  console.log(paint(BOLD, 'Offline and synchronisation suite'));
  console.log(`$ node tests/offline.test.js   # Chromium, production build at ${CLIENT_URL}, network emulated offline\n`);

  const ctx = {};

  /* -------------------------- bootstrap fixtures (not scored) -------------------------- */
  const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@test.gov.ng';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'SuperSecretPass123';

  const adminLogin = await api('POST', '/api/auth/login', { body: { email: adminEmail, password: adminPassword } });
  if (adminLogin.status !== 200) {
    console.error(paint(RED, `Cannot sign in as the administrator (${adminEmail}). Run:`));
    console.error('  node scripts/bootstrap-admin.js "Offline Admin" admin@test.gov.ng SuperSecretPass123');
    console.error('from server/, then re-run this suite. See OFFLINE_SETUP_NOTE.md.');
    process.exit(1);
  }
  ctx.adminToken = adminLogin.body.token;

  ctx.officerEmail = `offline.officer.${rand(3)}@test.gov.ng`;
  ctx.officerPassword = 'TestPassword1234';
  const createdOfficer = await api('POST', '/api/users', {
    token: ctx.adminToken,
    body: { full_name: 'Offline Suite Officer', email: ctx.officerEmail, password: ctx.officerPassword, role_name: 'COMPLIANCE_OFFICER' },
  });
  if (createdOfficer.status !== 201) {
    console.error(paint(RED, 'Could not create the officer fixture account.'), createdOfficer.body);
    process.exit(1);
  }

  ctx.imo = randomImo();
  const lodged = await api('POST', '/api/requests', {
    body: {
      vessel_imo: ctx.imo, vessel_name: 'MV OFFLINE SUITE', vessel_type: 'GENERAL_CARGO',
      gross_tonnage: 12000, flag_state: 'Nigeria', port: 'Lagos', berth: 'Apapa 2',
      agent_name: 'Offline Suite Agent', agent_email: `agent.${rand(3)}@example.com`,
      has_waste_to_land: true, channel: 'PORTAL',
    },
  });
  assertEqual(lodged.status, 201, 'fixture: expected the portal intake to accept the suite\'s request');
  ctx.requestId = lodged.body.request_id;

  const officerLoginForTriage = await api('POST', '/api/auth/login', { body: { email: ctx.officerEmail, password: ctx.officerPassword } });
  ctx.officerToken = officerLoginForTriage.body.token;
  const triaged = await api('POST', `/api/requests/${ctx.requestId}/triage`, { token: ctx.officerToken });
  assertEqual(triaged.status, 201, 'fixture: expected triage of the suite\'s request to open a case');
  ctx.caseReference = triaged.body.case_reference;

  /* -------------------------- browser -------------------------- */
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  let page = await browserContext.newPage();
  let requestLog = [];
  page.on('request', (req) => { requestLog.push(req.url()); });

  /* ====================================================================
   * TO-01 : Installability of the field client as assessed by Chromium
   * ================================================================== */
  await t('TO-01', 'Installability of the field client as assessed by Chromium', async () => {
    await page.goto(CLIENT_URL + '/');

    const manifestHref = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.href);
    assertTrue(!!manifestHref, 'expected an index.html <link rel="manifest"> — none found');

    const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref);
    assertEqual(manifest.display, 'standalone', 'installability requires display: standalone', manifest.display);
    assertTrue(!!manifest.start_url, 'installability requires a start_url', manifest);
    assertTrue(!!manifest.name, 'installability requires a name', manifest);
    const sizes = (manifest.icons || []).map(i => i.sizes);
    assertTrue(sizes.includes('192x192'), 'installability requires a >=192px icon', sizes);
    assertTrue(sizes.includes('512x512'), 'installability requires a >=512px icon', sizes);

    const sw = await waitFor(() => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && reg.active ? { scope: reg.scope } : null;
    }), { timeout: 10000 });
    assertTrue(!!sw, 'expected the vite-plugin-pwa service worker to be registered and active');
  });

  /* -------------------------- sign in (online), pack downloads -------------------------- */
  await page.fill('#email', ctx.officerEmail);
  await page.fill('#password', ctx.officerPassword);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Work queue', { timeout: 15000 });
  // let the instrument pack and the remote case list finish loading — this
  // list genuinely needs the network (GET /api/cases), which is why the
  // case is opened here, still online, before the officer sails out of
  // coverage; see the note above TO-02 for why.
  await waitFor(async () => {
    const html = await page.content();
    return html.includes(ctx.imo);
  }, { timeout: 10000 });

  /* -------------------------- open the case, still online -------------------------- */
  const caseRow = page.locator('.queue-row', { hasText: ctx.imo });
  await caseRow.locator('button', { hasText: 'Start' }).first().click();
  await page.waitForSelector('text=Cargo particulars', { timeout: 10000 });
  await page.selectOption('#ct', 'GENERAL_CARGO');
  await page.fill('#qt', '12000');
  await page.click('button:has-text("Continue to checklist")');
  await page.waitForSelector('.annexnav', { timeout: 10000 });

  ctx.localId = (await page.evaluate(() => location.hash)).split('/').pop();
  assertTrue(!!ctx.localId && ctx.localId.startsWith('L-'), 'expected a local device id in the URL hash');

  /* ====================================================================
   * TO-02 : Relaunch the application with the network disabled
   * ================================================================== *
   * The officer has boarded and the case is already on the device
   * (createInspection() already wrote the local_id row) — this is the
   * point at which real coverage would actually be lost. "Relaunching"
   * is tested by closing the page, switching the whole context offline,
   * and opening a fresh page: the real IndexedDB/service-worker storage
   * for the origin lives on the context, not the page, so this is a
   * genuine close-and-reopen, not a fresh profile. */
  await t('TO-02', 'Relaunch the application with the network disabled', async () => {
    await page.close();
    await browserContext.setOffline(true);
    page = await browserContext.newPage();
    requestLog = [];
    page.on('request', (req) => { requestLog.push(req.url()); });

    await page.goto(CLIENT_URL + '/#/queue', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('text=Work queue', { timeout: 15000 });
    const pillText = await page.locator('.pill').first().textContent();
    assertEqual(pillText.trim(), 'Offline', 'expected the connectivity pill to read Offline', pillText);

    const online = await page.evaluate(() => navigator.onLine);
    assertEqual(online, false, 'expected navigator.onLine to be false with the context offline');

    // "On this device" is read straight from local Dexie (listInspections()),
    // so it needs no network at all — unlike "Awaiting attendance", which
    // calls the API and is correctly left unable to load offline.
    const onDevice = page.locator('.queue-row', { hasText: ctx.imo });
    assertTrue(await onDevice.count() > 0, 'expected the already-started inspection to still be listed "On this device" with no network');
  });

  /* -------------------------- resume the inspection, offline -------------------------- */
  await page.locator('.queue-row', { hasText: ctx.imo }).first().click();
  await page.waitForSelector('text=Cargo particulars', { timeout: 10000 });
  await page.click('button:has-text("Continue to checklist")');
  await page.waitForSelector('.annexnav', { timeout: 10000 });

  // From here on, every scenario's "no network reached the server" check is
  // about the INSPECTION path specifically (sync.js's own documented
  // guarantee). WorkQueue's own "Awaiting attendance" list is a different,
  // genuinely network-dependent feature (GET /api/cases) that was already
  // exercised, correctly failing, on the relaunch screen just now — it is
  // not part of what TO-03/TO-04 are checking, so the log is reset here.
  requestLog = [];

  /** Fill one applicable item, dispatching on the real response_type it
   *  renders — the same switch client/src/components/Item.jsx itself
   *  implements. A CERTIFICATE item is a Ternary PLUS a date field that
   *  only appears once "YES" is selected, so both are handled in one pass
   *  (the Ternary button is a TOGGLE — clicking an already-pressed "yes"
   *  a second time would turn the response back to UNANSWERED). */
  async function fillItem(item) {
    const triYes = item.locator('.tri[role="group"] button.yes');
    if (await triYes.count() > 0) {
      const pressed = await triYes.first().getAttribute('aria-pressed');
      if (pressed !== 'true') {
        await triYes.first().click();
        // give React a moment to re-render the Certificate sub-panel
        // (the valid-until date field) that "YES" reveals, if this is one.
        await item.locator('input[type="date"]').first().waitFor({ state: 'visible', timeout: 800 }).catch(() => {});
      }
      const validUntil = item.locator('input[type="date"]');
      if (await validUntil.count() > 0) {
        const existing = await validUntil.first().inputValue();
        if (!existing) {
          // Certificate revealed: give it a value far enough ahead that
          // evaluateCertificate() (shared/rules.mjs) reads VALID, not EXPIRED.
          await validUntil.first().fill('2030-01-01');
        }
      }
      return;
    }
    const dateOnly = item.locator('input[type="date"]');
    if (await dateOnly.count() > 0) {
      await dateOnly.first().fill('2026-01-15');
      return;
    }
    const numeric = item.locator('input[inputmode="decimal"]');
    if (await numeric.count() > 0) {
      const val = await numeric.first().inputValue();
      if (!val) await numeric.first().fill('12.5');
      return;
    }
    const chip = item.locator('.chips .chip');
    if (await chip.count() > 0) {
      const pressedChip = await chip.first().getAttribute('aria-pressed');
      if (pressedChip !== 'true') await chip.first().click();
      return;
    }
    const remark = item.locator('textarea');
    if (await remark.count() > 0) {
      const val = await remark.first().inputValue();
      if (!val) await remark.first().fill('Observed in order.');
      return;
    }
  }

  async function fillVisibleItems() {
    const items = page.locator('.item:not(.na)');
    const n = await items.count();
    for (let i = 0; i < n; i++) {
      await fillItem(items.nth(i));
    }
  }

  /** Walk every section tab that actually holds items (its counter reads
   *  "answered/total" with total > 0) and fill it. */
  async function fillWholeChecklist() {
    const navButtons = page.locator('.annexnav button');
    const total = await navButtons.count();
    for (let k = 0; k < total; k++) {
      const label = await navButtons.nth(k).textContent();
      const m = label.match(/(\d+)\/(\d+)/);
      if (!m || Number(m[2]) === 0) continue;
      await navButtons.nth(k).click();
      await page.waitForTimeout(150);
      await fillVisibleItems();
      await page.waitForTimeout(150);
      await fillVisibleItems(); // second pass: catches any Certificate sub-field a slow re-render missed first time
    }
  }

  /* ====================================================================
   * TO-03 : Record every applicable response and attach evidence,
   *         network disabled
   * ================================================================== */
  await t('TO-03', 'Record every applicable response and attach evidence with the network disabled', async () => {
    assertEqual(await page.evaluate(() => navigator.onLine), false, 'expected to still be offline for this scenario');
    const dockBefore = await page.locator('.dock .stat b').first().textContent();
    await fillWholeChecklist();
    const dockAfter = await page.locator('.dock .stat b').first().textContent();
    assertTrue(Number(dockAfter) > Number(dockBefore), 'expected the answered count to have increased after filling the checklist',
      { dockBefore, dockAfter });

    // attach a photograph to the first applicable item on the Annex I tab
    await page.locator('.annexnav button', { hasText: 'Annex I' }).first().click();
    await page.waitForTimeout(150);
    const fileInput = page.locator('.item:not(.na) input[type="file"]').first();
    const fs = require('fs');
    const tmpImg = `${require('os').tmpdir()}/offline-suite-evidence.png`;
    // a tiny, real, valid 1x1 PNG — not a stub: addEvidence() genuinely
    // decodes it with an <img>, draws it to a <canvas>, and re-encodes it
    // as JPEG, exactly as it would for a real device-camera photograph.
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    fs.writeFileSync(tmpImg, Buffer.from(pngBase64, 'base64'));
    await fileInput.setInputFiles(tmpImg);
    await page.waitForTimeout(600);

    const rows = await readInspections(page);
    const insp = rows.find(r => r.local_id === ctx.localId);
    assertTrue(!!insp, 'expected the inspection to exist on the device');
    const responseStates = Object.values(insp.responses || {});
    const unanswered = responseStates.filter(r => !r.response_state || r.response_state === 'UNANSWERED').length;
    assertEqual(unanswered, 0, 'expected no recorded response to be left UNANSWERED', { unanswered, total: responseStates.length });

    const evidenceRows = await readEvidence(page);
    const mine = evidenceRows.filter(e => e.local_id === ctx.localId);
    assertTrue(mine.length >= 1, 'expected at least one evidence blob to have been written to IndexedDB', mine.length);
    ctx.evidenceItemId = mine[0].item_id;

    const apiCalls = requestLog.filter(u => u.includes('/api/'));
    assertEqual(apiCalls.length, 0, 'expected zero network requests to the API while recording an inspection offline', apiCalls);
  });

  /* ====================================================================
   * TO-11 : Device storage above 80 per cent during an inspection
   *
   * Honest adaptation: this was originally driven through the DevTools
   * protocol command Storage.overrideQuotaForOrigin, which works in some
   * Chrome builds/environments but not others — verified against a real
   * machine where the command was accepted without error but silently had
   * no effect (navigator.storage.estimate().quota stayed at the real
   * multi-gigabyte device quota throughout a 30-second poll, confirmed by
   * diagnostic output, rather than moving towards the requested value).
   * Raising timeouts could never have fixed that, since the override was
   * never landing at all, not landing late.
   *
   * The substitute keeps the same real signal the application itself reads
   * — navigator.storage.estimate() — but sets the tightened quota directly
   * on the page rather than asking Chrome's internal quota manager to do
   * it. Real device usage (IndexedDB + caches + service worker) is left
   * completely untouched and still read live; only the "quota" half of the
   * fraction is substituted, in the one spot both the test and the app's
   * own storage-pressure banner read it from, so the two stay consistent
   * with each other exactly as they would under a genuinely tight device.
   * ================================================================== */
  await t('TO-11', 'Device storage above 80 per cent during an inspection (quota overridden on the page)', async () => {
    const before = await page.evaluate(async () => (await navigator.storage.estimate()));
    assertTrue(before.usage > 0, 'expected the real IndexedDB usage to already be nonzero (pack + inspection + evidence)', before);

    const tightQuota = Math.ceil(before.usage * 1.15); // real usage will sit at ~87% of this
    await page.evaluate((quota) => {
      const real = navigator.storage.estimate.bind(navigator.storage);
      navigator.storage.estimate = async () => {
        const e = await real();
        return { ...e, quota };
      };
    }, tightQuota);

    const after = await page.evaluate(async () => {
      const e = await navigator.storage.estimate();
      e.pct = e.quota ? Math.round((e.usage / e.quota) * 100) : null;
      return e;
    });
    assertTrue(after && after.pct > 80,
      'expected navigator.storage.estimate() to report over 80% after the quota was overridden',
      { requestedQuota: tightQuota, before, after });

    // Inspection.jsx only recomputes storageEstimate() when the inspection
    // record itself changes (useEffect keyed on insp.updated_at) — force a
    // real one by toggling an already-answered Ternary button off and back
    // on (clicking an already-pressed "yes" is itself a real UNANSWERED
    // write, and clicking it again restores CONFORMING), which is a real
    // patchInspection() write, not a no-op click.
    await page.locator('.annexnav button', { hasText: 'Annex I' }).first().click();
    await page.waitForTimeout(200);
    const toggle = page.locator('.item:not(.na) .tri[role="group"] button.yes').first();
    await toggle.click();
    await page.waitForTimeout(150);
    await toggle.click();
    const notice = await waitFor(() => page.locator('.notice', { hasText: 'Device storage is' }).first().textContent().catch(() => null),
      { timeout: 30000, label: 'waiting for the on-screen "Device storage is ... used" notice to appear' });
    assertTrue(notice.includes('used'), 'expected the client\'s own storage-pressure notice to be visible', notice);

    // restore the real quota reading so the rest of the suite (more
    // evidence, the Dexie writes during sync) is not artificially starved.
    await page.evaluate(() => { delete navigator.storage.estimate; });
  });

  /* ====================================================================
   * TO-05 : Close and relaunch mid-inspection with the network still
   *         disabled
   * ================================================================== */
  await t('TO-05', 'Close and relaunch mid-inspection with the network still disabled', async () => {
    assertEqual(await page.evaluate(() => navigator.onLine), false, 'expected still to be offline going into the relaunch');
    const beforeClose = await readInspections(page);
    const mineBefore = beforeClose.find(r => r.local_id === ctx.localId);

    await page.close();
    page = await browserContext.newPage();
    requestLog = [];
    page.on('request', (req) => { requestLog.push(req.url()); });
    await page.goto(`${CLIENT_URL}/#/inspection/${ctx.localId}`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.annexnav', { timeout: 15000 });
    await page.waitForTimeout(500);

    assertEqual(await page.evaluate(() => navigator.onLine), false, 'expected to still be offline after the relaunch');

    const after = await readInspections(page);
    const mineAfter = after.find(r => r.local_id === ctx.localId);
    assertTrue(!!mineAfter, 'expected the in-progress inspection to still be on the device after relaunch');
    assertEqual(Object.keys(mineAfter.responses).length, Object.keys(mineBefore.responses).length,
      'expected every recorded response to have survived the relaunch, with the network still off');

    const evidenceAfter = (await readEvidence(page)).filter(e => e.local_id === ctx.localId);
    assertTrue(evidenceAfter.length >= 1, 'expected the attached evidence blob to have survived the relaunch');
  });

  /* -------------------------- declarations + sign, still offline -------------------------- */
  await page.click('.dock button:has-text("Sign off")');
  await page.waitForSelector('text=Waste declared for landing', { timeout: 10000 });
  const annexVRow = page.locator('.item', { has: page.locator('.code', { hasText: /^ANNEX V$/ }) });
  await annexVRow.locator('button.yes', { hasText: 'To be landed' }).click();
  await annexVRow.locator('input[inputmode="decimal"]').first().fill('4.5');
  await page.click('button:has-text("Continue to signing")');
  await page.waitForSelector('text=Complete inspection', { timeout: 10000 });
  await page.fill('#sig-MASTER_OR_CHIEF_OFFICER', 'Capt. A. N. Officer');
  await page.fill('#sig-NIMASA_INSPECTOR', 'Offline Suite Officer');

  /* ====================================================================
   * TO-06 : Complete and sign the inspection offline
   * ================================================================== */
  await t('TO-06', 'Complete and sign the inspection offline', async () => {
    assertEqual(await page.evaluate(() => navigator.onLine), false, 'expected to still be offline while signing');
    await page.click('button:has-text("Sign and queue for sync")');
    await page.waitForSelector('text=Documents for the Master', { timeout: 10000 });

    const rows = await readInspections(page);
    const insp = rows.find(r => r.local_id === ctx.localId);
    assertEqual(insp.status, 'QUEUED', 'expected the signed inspection\'s local status to be QUEUED while offline', insp.status);
    assertEqual(insp.signatories.length, 2, 'expected both the vessel and NIMASA signatures to have been recorded', insp.signatories);

    const queue = await readQueue(page);
    const mine = queue.filter(q => q.local_id === ctx.localId);
    assertTrue(mine.length === 1, 'expected exactly one queue entry for this inspection', mine);
    assertTrue(['PENDING', 'RETRY'].includes(mine[0].state), 'expected the queue entry to still be awaiting transmission', mine[0].state);
  });

  /* ====================================================================
   * TO-04 : Complete an entire inspection with the network disabled
   * ================================================================== */
  await t('TO-04', 'Complete an entire inspection with the network disabled', async () => {
    // The real assertion for "with the network disabled" is that nothing
    // ever reached the API from the moment the context went offline
    // (TO-02) through cargo, the full checklist, evidence, declarations
    // and signing — this is sync.js's own stated design property, checked
    // here against the real request log Chromium itself recorded.
    const apiCalls = requestLog.filter(u => u.includes('/api/'));
    assertEqual(apiCalls.length, 0, 'expected zero network requests to the API for the whole boarding-to-signing flow while offline', apiCalls);

    const rows = await readInspections(page);
    const insp = rows.find(r => r.local_id === ctx.localId);
    assertEqual(insp.status, 'QUEUED', 'expected the inspection to have reached QUEUED entirely offline', insp.status);
    assertTrue(insp.declarations.length >= 1, 'expected the waste declaration recorded offline to have been persisted', insp.declarations);
  });

  /* ====================================================================
   * TO-07 : Restore connectivity
   * ================================================================== */
  await t('TO-07', 'Restore connectivity', async () => {
    await browserContext.setOffline(false);
    assertEqual(await page.evaluate(() => navigator.onLine), true, 'expected navigator.onLine to flip true once the context is back online');

    const synced = await waitFor(async () => {
      const rows = await readInspections(page);
      const insp = rows.find(r => r.local_id === ctx.localId);
      return insp && insp.status === 'SYNCED' ? insp : null;
    }, { timeout: 20000, interval: 500 });
    assertTrue(!!synced.mci_number, 'expected the server to have allocated a real MCI number on sync', synced);
    ctx.mciNumber = synced.mci_number;
    ctx.inspectionId = synced.server_id;

    const history = await api('GET', `/api/vessels/${ctx.imo}/history`, { token: ctx.officerToken });
    assertEqual(history.status, 200, 'expected the officer to be able to read the vessel\'s history after sync', history.body);
    const found = history.body.inspections.find(i => i.mci_number === ctx.mciNumber);
    assertTrue(!!found, 'expected the just-synchronised inspection to actually be present server-side', history.body.inspections);
  });

  /* ====================================================================
   * TO-12 : Restore connectivity after an inspection carrying a
   *         photograph
   * ================================================================== */
  await t('TO-12', 'Restore connectivity after an inspection carrying a photograph', async () => {
    const uploaded = await waitFor(async () => {
      const ev = (await readEvidence(page)).filter(e => e.local_id === ctx.localId);
      return ev.length >= 1 && ev.every(e => e.uploaded_at) ? ev : null;
    }, { timeout: 20000, interval: 500 });
    assertTrue(uploaded.every(e => e.server_path), 'expected every uploaded evidence row to carry the server-returned path', uploaded);

    const q = psql(SETUP_DATABASE_URL,
      `SELECT evidence_path FROM inspection_response r
         JOIN inspection i ON i.inspection_id = r.inspection_id
        WHERE i.mci_number = '${ctx.mciNumber}' AND r.item_id = '${ctx.evidenceItemId}'`);
    assertTrue(q.ok, 'expected the direct-database check for the synced evidence path to run', q);
    assertTrue(!!q.stdout, 'expected the server-side inspection_response row to carry a non-null evidence_path after the photograph synced', q.stdout);
  });

  /* ====================================================================
   * TS-11 : Sign out with records synchronised
   * ================================================================== */
  await t('TS-11', 'Sign out with records synchronised', async () => {
    const before = await readInspections(page);
    assertTrue(before.find(r => r.local_id === ctx.localId)?.status === 'SYNCED',
      'expected the inspection to be fully synchronised before signing out');

    await page.click('button:has-text("Both documents")').catch(() => {});
    await page.goto(`${CLIENT_URL}/#/queue`, { waitUntil: 'load' });
    await page.waitForSelector('text=Work queue', { timeout: 10000 });
    await page.click('button:has-text("Sign out")');
    await page.waitForSelector('text=Sign in', { timeout: 10000 });

    const afterInsp = await readInspections(page);
    const afterQueue = await readQueue(page);
    const afterEvidence = await readEvidence(page);
    const afterSession = await readSession(page);
    assertEqual(afterInsp.length, 0, 'expected device inspections to be cleared on sign-out', afterInsp.length);
    assertEqual(afterQueue.length, 0, 'expected the sync queue to be cleared on sign-out', afterQueue.length);
    assertEqual(afterEvidence.length, 0, 'expected device evidence to be cleared on sign-out', afterEvidence.length);
    assertEqual(afterSession, null, 'expected the saved session to be cleared on sign-out', afterSession);
  });

  await browser.close();

  /* -------------------------- summary -------------------------- */
  console.log('');
  const summary = `${pass} passed, ${fail} failed`;
  console.log(fail === 0 ? paint(GREEN, summary) : paint(RED, summary));
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error(paint(RED, 'Suite aborted: '), e);
  process.exit(1);
});
