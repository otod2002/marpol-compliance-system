/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 * Missing from the uploaded bundle. Talks to the server built earlier
 * (server/src/routes/intake.js). Base URL is configurable via a Vite env
 * var so this can point at a different host later without code changes.
 *
 * NOTE — known mismatch, not something this file can fix on its own:
 * Track.jsx expects a request's status to progress through SUBMITTED ->
 * ACKNOWLEDGED -> SCHEDULED -> CONVERTED, but server/src/routes/intake.js
 * only ever sets SUBMITTED or CONVERTED. ACKNOWLEDGED/SCHEDULED do not
 * currently exist anywhere in the server. Until the server is extended to
 * set those intermediate statuses (or Track.jsx's stage list is trimmed to
 * match what the server actually produces), the tracker will only ever
 * show the first and last steps as reached, never the two in between.
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  /** FR-04: lodge a request through public intake. */
  lodgeRequest: body => request('/requests', { method: 'POST', body: JSON.stringify(body) }),

  /** FR-08: track a request by its reference, no account needed. */
  trackRequest: reference => request(`/requests/${encodeURIComponent(reference)}`),

  /**
   * FR-09: an operator's own vessel history, by IMO number. Calls the
   * public variant in server/src/routes/portal.js, not the officer-only
   * endpoint in inspections.js — see that file's header comment for the
   * access-control decision this still leaves open.
   */
  vesselHistory: imo => request(`/vessels/${encodeURIComponent(imo)}/history/public`),

  /** FR-10: submit evidence a raised deficiency was rectified. */
  submitCorrectiveAction: body => request('/corrective-action', { method: 'POST', body: JSON.stringify(body) }),

  /** FR-13: raise an enquiry, kept as a reply-able thread. */
  raiseEnquiry: body => request('/enquiries', { method: 'POST', body: JSON.stringify(body) }),
};
