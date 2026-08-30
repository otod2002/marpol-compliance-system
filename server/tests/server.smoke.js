'use strict';
/**
 * Server smoke test.
 *
 * Verifies that the application assembles, that public routes are reachable,
 * and — most importantly — that authorisation is refused at the SERVER for
 * requests the interface would never offer. This is the property test case
 * TS-03 describes, and it is checked here without a database because the
 * refusal occurs in middleware, before any query is issued.
 *
 * Run: node tests/server.smoke.js
 */
process.env.JWT_SECRET = 'smoke-test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused@localhost:5432/unused';

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const { buildApp } = require('../src/app');

let pass = 0, fail = 0;
const t = (id, name, fn) => fn()
  .then(() => { pass++; console.log(`  PASS  ${id}  ${name}`); })
  .catch(e => { fail++; console.log(`  FAIL  ${id}  ${name}\n        ${e.message}`); });

function request(server, { method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, method, path,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: safeJson(buf) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const safeJson = s => { try { return JSON.parse(s); } catch { return s; } };
const tokenFor = role => jwt.sign({ user_id: '00000000-0000-0000-0000-000000000001', role }, 'smoke-test-secret');

(async () => {
  const server = buildApp().listen(0);
  await new Promise(r => server.once('listening', r));
  console.log('\nServer assembly and authorisation');

  await t('SM-01', 'application assembles and health endpoint responds', async () => {
    const r = await request(server, { path: '/health' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'ok');
  });

  await t('SM-02', 'unknown route returns 404 as JSON', async () => {
    const r = await request(server, { path: '/api/nonexistent' });
    assert.strictEqual(r.status, 404);
  });

  await t('TS-03a', 'protected route refuses an unauthenticated request', async () => {
    const r = await request(server, { path: '/api/requests' });
    assert.strictEqual(r.status, 401, `got ${r.status}`);
  });

  await t('TS-03b', 'protected route refuses a forged/expired token', async () => {
    const bad = jwt.sign({ user_id: 'x', role: 'SUPERVISOR' }, 'wrong-secret');
    const r = await request(server, { path: '/api/requests', token: bad });
    assert.strictEqual(r.status, 401, `got ${r.status}`);
  });

  await t('TS-03c', 'a valid token in the wrong role is refused at the server', async () => {
    // A vessel agent holds a legitimate session but may not read the officer
    // work queue. The interface would not offer this; the request is issued
    // directly, and the server refuses on role grounds.
    const r = await request(server, { path: '/api/requests', token: tokenFor('VESSEL_AGENT') });
    assert.strictEqual(r.status, 403, `expected 403, got ${r.status}`);
  });

  await t('TS-04a', 'a waste team leader may not attest the RECEIVED stage', async () => {
    const r = await request(server, {
      method: 'POST', path: '/api/waste-notes/11111111-1111-1111-1111-111111111111/custody',
      token: tokenFor('WASTE_TEAM_LEADER'), body: { stage: 'RECEIVED', quantity: 10, quantity_unit: 'CBM' },
    });
    assert.strictEqual(r.status, 403, `expected 403, got ${r.status}`);
    assert.ok(/may not attest/.test(r.body.error || ''), r.body.error);
  });

  await t('TS-04b', 'a facility receiver may not attest the COLLECTED stage', async () => {
    const r = await request(server, {
      method: 'POST', path: '/api/waste-notes/11111111-1111-1111-1111-111111111111/custody',
      token: tokenFor('FACILITY_RECEIVER'), body: { stage: 'COLLECTED', quantity: 10, quantity_unit: 'CBM' },
    });
    assert.strictEqual(r.status, 403, `expected 403, got ${r.status}`);
  });

  await t('TS-04c', 'the role scoped to a stage is permitted past authorisation', async () => {
    // Passes the authorisation gate, then fails on the database (absent here).
    // A 403 would mean the scoping is wrong; anything else means it is right.
    const r = await request(server, {
      method: 'POST', path: '/api/waste-notes/11111111-1111-1111-1111-111111111111/custody',
      token: tokenFor('FACILITY_RECEIVER'), body: { stage: 'RECEIVED', quantity: 10, quantity_unit: 'CBM' },
    });
    assert.notStrictEqual(r.status, 403, 'correct role was wrongly refused');
  });

  await t('TS-10', 'a malformed payload is rejected by schema validation', async () => {
    const r = await request(server, {
      method: 'POST', path: '/api/requests',
      body: { vessel_imo: '', agent_email: 'not-an-email' },
    });
    assert.strictEqual(r.status, 400, `expected 400, got ${r.status}`);
  });

  await t('SM-03', 'unknown custody stage is rejected before any query', async () => {
    const r = await request(server, {
      method: 'POST', path: '/api/waste-notes/11111111-1111-1111-1111-111111111111/custody',
      token: tokenFor('WASTE_TEAM_LEADER'), body: { stage: 'TELEPORTED' },
    });
    assert.strictEqual(r.status, 400, `expected 400, got ${r.status}`);
  });

  server.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
