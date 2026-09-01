/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 * Missing from the uploaded bundle. The return shape of `post()` — an
 * object with .status and .body rather than throwing on non-2xx — is not
 * my choice: it's dictated by sync.js, which already reads res.status and
 * res.body to distinguish 200/201 (synced) from 409 (conflict) from other
 * 4xx (rejected). Written to match that contract exactly.
 */
import { loadSession } from './db.js';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function authHeader() {
  const s = await loadSession();
  return s && s.token ? { Authorization: `Bearer ${s.token}` } : {};
}

export async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

/**
 * Added — not in the uploaded bundle. Admin.jsx calls patch() for account
 * updates (deactivate/reactivate, role change, password reset); nothing
 * exported it. Matches post()'s { status, body } contract exactly, since
 * Admin.jsx's toggle() checks r.ok the way it checks r.status === 201 for
 * create() — see the fix in Admin.jsx itself for the other half of this.
 */
export async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, ok: res.ok, body: parsed };
}

export async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((parsed && parsed.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return parsed;
}

/** FR-... : sign in and receive a bearer token (server/src/routes/intake.js). */
export async function login(email, password) {
  const res = await post('/auth/login', { email, password });
  if (res.status !== 200) {
    const err = new Error((res.body && res.body.error) || 'Sign in failed');
    err.status = res.status;
    throw err;
  }
  return res.body; // { token, user }
}

/** The instrument pack, cached by the service worker for offline use. */
export const fetchInstrumentPack = () => get('/instrument/active');

/** Compliance cases awaiting an officer's attendance (server/src/routes/cases.js). */
export const fetchWorkQueue = () => get('/cases');
