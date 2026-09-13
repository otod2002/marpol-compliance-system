/**
 * API client for the field application.
 *
 * FIXED AT THE ROOT — every one of get()/post()/patch() now consistently
 * returns { status, ok, body }. Earlier, get() alone threw on a non-2xx
 * response and returned the raw body directly on success, while post()
 * returned { status, body } with no .ok, and patch() returned
 * { status, ok, body }. Three different shapes for what should be one
 * contract. That inconsistency wasn't visible in isolation — each page
 * that used only one of the three "worked" — but every single page
 * uploaded across this project (WasteNote.jsx, Triage.jsx, Admin.jsx,
 * Verify.jsx, Instruments.jsx, Documents.jsx) was written assuming
 * `const r = await get(...); if (r.ok) ...`, which only ever matches
 * this consistent shape. Rather than keep patching each new page to
 * match get()'s throwing behaviour, this fixes get() itself, and the
 * five pages that were patched to work around it are reverted to their
 * original, correct form to match.
 *
 * fetchInstrumentPack() and fetchWorkQueue() are the two exceptions:
 * App.jsx and WorkQueue.jsx already consume them assuming the OLD
 * throw-and-return-raw-data behaviour (`await fetchInstrumentPack()`
 * used directly as the pack; `.then(setRemote).catch(...)` on
 * fetchWorkQueue()). Rather than touch those two files too, both
 * functions translate the new get() contract back to that old shape
 * internally, so nothing outside this file needs to change for them.
 */
import { loadSession } from './db.js';

const BASE = import.meta.env.VITE_API_URL || '/api';

async function authHeader() {
  const s = await loadSession();
  return s && s.token ? { Authorization: `Bearer ${s.token}` } : {};
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await authHeader()),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body, or not JSON */ }
  return { status: res.status, ok: res.ok, body: parsed };
}

export const get   = path => call(path);
export const post  = (path, body) => call(path, { method: 'POST', body });
export const patch = (path, body) => call(path, { method: 'PATCH', body });

/** FR-... : sign in and receive a bearer token (server/src/routes/intake.js). */
export async function login(email, password) {
  const r = await post('/auth/login', { email, password });
  if (!r.ok) {
    const err = new Error((r.body && r.body.error) || 'Sign in failed');
    err.status = r.status;
    throw err;
  }
  return r.body; // { token, user }
}

/**
 * The instrument pack, cached by the service worker for offline use.
 * Kept throw-on-error / return-raw-body-on-success so App.jsx's
 * `await fetchInstrumentPack()` continues to work unchanged.
 */
export async function fetchInstrumentPack() {
  const r = await get('/instrument/active');
  if (!r.ok) {
    const err = new Error((r.body && r.body.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return r.body;
}

/**
 * Compliance cases awaiting an officer's attendance (server/src/routes/cases.js).
 * Kept as a plain promise that resolves to the array or rejects, so
 * WorkQueue.jsx's `.then(setRemote).catch(...)` continues to work unchanged.
 */
export async function fetchWorkQueue() {
  const r = await get('/cases');
  if (!r.ok) {
    const err = new Error((r.body && r.body.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return r.body;
}

/**
 * Download an authenticated PDF.
 *
 * A plain anchor cannot be used: the endpoint requires a bearer token, and
 * a browser navigation carries no Authorization header. The document is
 * therefore fetched as a blob with the token attached and handed to the
 * browser through an object URL, which also lets the filename be set.
 */
export async function downloadPdf(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
