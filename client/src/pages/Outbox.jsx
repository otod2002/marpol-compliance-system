import React, { useEffect, useState } from 'react';
import { get, post } from '../api.js';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. Every mockup masthead in this batch
 * (pwa-handover-two-documents.png, pwa-provisional-waste-note.png) shows an
 * "Outbox" button, and delivery.js provides real, working endpoints for it
 * (GET /outbox, POST /outbox/:id/dispatch) — but no page component was
 * provided to actually show it. Built to match the existing design system
 * (status badges reused from the sync-queue styling already in
 * styles.css) rather than a mockup, since none exists for this screen
 * specifically.
 *
 * "Dispatch" here means "mark as sent/failed" — this environment has no
 * live mail transport configured (delivery.js's own header comment
 * explains why: SMTP credentials do not belong in a repository), so a
 * message composed here sits QUEUED until this button records what a real
 * transport would have reported. That is a genuine limitation worth being
 * upfront about, not something this page hides.
 */
const STATE_CLASS = { QUEUED: 'queued', SENT: 'synced', FAILED: 'conflict', SUPPRESSED: 'conflict' };

export default function Outbox({ go }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);

  const load = async () => {
    const r = await get('/outbox');
    if (r.ok) setRows(r.body); else setMsg({ bad: true, text: r.body.error });
  };
  useEffect(() => { load(); }, []);

  async function dispatch(id, succeeded) {
    setBusy(id);
    const r = await post(`/outbox/${id}/dispatch`, { succeeded });
    setBusy(null);
    if (r.ok) { setMsg({ text: succeeded ? 'Marked sent.' : 'Marked failed.' }); load(); }
    else setMsg({ bad: true, text: r.body.error });
  }

  return (
    <div className="wrap page">
      <a className="back" href="#" onClick={e => { e.preventDefault(); go('/queue'); }}>&larr; Queue</a>
      <h1>Outbox</h1>
      <p className="lede">
        Every document delivery this system has composed, whether or not a mail
        transport is configured here. No live transport is configured in this
        environment — dispatch is recorded manually below to demonstrate the
        behaviour without a real mail server.
      </p>

      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <div className="panel">
        {!rows && <div className="center">Loading…</div>}
        {rows && rows.length === 0 && <div className="center">Nothing has been composed yet.</div>}
        {rows && rows.map(m => (
          <div className="row" key={m.message_id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <strong>{m.subject}</strong>
                <div className="ref">
                  To {m.recipient_name ? `${m.recipient_name} · ` : ''}{m.recipient} &middot; queued {new Date(m.queued_at).toLocaleString()}
                  {m.queued_by_name ? ` by ${m.queued_by_name}` : ''}
                </div>
                {m.token_id && (
                  <div className="ref">
                    Link retrieved {m.retrieval_count || 0} time{m.retrieval_count === 1 ? '' : 's'}
                    {m.last_retrieved_at ? ` · last ${new Date(m.last_retrieved_at).toLocaleString()}` : ''}
                    {' · expires '}{new Date(m.expires_at).toLocaleDateString()}
                  </div>
                )}
                {m.failure_reason && <div className="ref" style={{ color: 'var(--danger)' }}>{m.failure_reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
                <span className={`status ${STATE_CLASS[m.state] || 'queued'}`}>{m.state}</span>
                <button className="chip" onClick={() => setOpen(open === m.message_id ? null : m.message_id)}>
                  {open === m.message_id ? 'Hide' : 'View'}
                </button>
              </div>
            </div>

            {open === m.message_id && (
              <pre className="mono" style={{
                whiteSpace: 'pre-wrap', fontSize: 12.5, background: 'var(--chart)',
                padding: 12, borderRadius: 3, marginTop: 10,
              }}>{m.body_text}</pre>
            )}

            {m.state === 'QUEUED' && (
              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn small" disabled={busy === m.message_id}
                  onClick={() => dispatch(m.message_id, true)}>Mark sent</button>
                <button className="btn ghost small" disabled={busy === m.message_id}
                  onClick={() => dispatch(m.message_id, false)}>Mark failed</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
