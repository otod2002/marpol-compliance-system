import React, { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { clearDevice } from '../db.js';

/**
 * TRIAGE  (FR-07)
 *
 * The join between the public portal and the inspection regime. A lodged
 * request sits at SUBMITTED until an officer converts it into a compliance
 * case; conversion is a deliberate act, never automatic on submission,
 * because it preserves the discretion to decline and stops a malformed
 * submission from opening a case that must then be reversed.
 *
 * A request converts at most once. The server rejects a second attempt and
 * a partial unique index on inspection_request.case_id enforces the same
 * invariant independently, so it holds even if this screen misbehaves.
 *
 * Added here: the masthead. The uploaded draft had none, matching a gap
 * already found and fixed once before in Admin.jsx — this mockup
 * (pwa-triage-new-requests.png) shows the same Queue/Sign out pattern, so
 * it's built the same way for consistency rather than invented fresh.
 */
const ROLE_LABEL = { COMPLIANCE_OFFICER: 'Compliance officer', SUPERVISOR: 'Supervisor' };

export default function Triage({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function signOut() {
    await clearDevice();
    onSignedOut();
  }

  // Fixed here: get() throws on a non-2xx response and returns the parsed
  // body directly on success — it does not return a { ok, body } shape.
  // Same contract mismatch already fixed in Admin.jsx/WasteNote.jsx/
  // Supervisor.jsx; see Admin.jsx's comment for why.
  const load = async () => {
    try {
      setRows(await get('/requests?status=SUBMITTED'));
    } catch (e) {
      setMsg({ bad: true, text: e.message });
    }
  };
  useEffect(() => { load(); }, []);

  async function triage(req) {
    setBusy(req.request_id); setMsg(null);
    const r = await post(`/requests/${req.request_id}/triage`, {});
    setBusy(null);
    if (r.status === 201) {
      setMsg({ text: `Case ${r.body.case_reference} opened for ${req.vessel_name || req.vessel_imo}. It is now in the work queue.` });
      load();
    } else if (r.status === 409) {
      setMsg({ bad: true, text: 'That request has already been converted into a case.' });
      load();
    } else {
      setMsg({ bad: true, text: r.body.error || 'Could not open a case.' });
    }
  }

  async function decline(req) {
    if (!reason.trim()) { setMsg({ bad: true, text: 'Give a reason, so the agent knows what to correct.' }); return; }
    setBusy(req.request_id);
    const r = await post(`/requests/${req.request_id}/decline`, { reason: reason.trim() });
    setBusy(null); setDeclining(null); setReason('');
    // Fixed here: post() returns { status, body } — it has no .ok field.
    // Same fix already applied to Supervisor.jsx's approve(). The decline
    // endpoint (server/src/routes/intake.js) returns 200 on success.
    if (r.status === 200) { setMsg({ text: 'Request declined. The agent can see the reason when tracking it.' }); load(); }
    else setMsg({ bad: true, text: (r.body && r.body.error) || 'Could not decline the request.' });
  }

  return (
    <>
      <header className="masthead field">
        <div className="masthead-inner">
          <div className="brand-text">
            <span className="brand-name">Marpol Field</span>
            <span className="brand-sub">{me?.full_name} &middot; {ROLE_LABEL[me?.role] || me?.role}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <button className="btn ghost small" onClick={() => go('/queue')}>Queue</button>
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
      <h1>New requests</h1>
      <p className="lede">
        Requests lodged through the portal, by telephone, or on berth arrival.
        Converting one opens a compliance case and puts the vessel in the work queue.
      </p>

      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <div className="panel">
        {rows.length === 0 && <div className="center">No requests awaiting triage.</div>}
        {rows.map(r => (
          <div key={r.request_id} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
            <div className="row" style={{ borderBottom: 0, padding: 0 }}>
              <div>
                <strong>{r.vessel_name || 'Unnamed vessel'}</strong>
                {r.has_waste_to_land && <span className="badge soon" style={{ marginLeft: 8 }}>Waste to land</span>}
                <div className="ref">
                  IMO {r.vessel_imo} · {r.vessel_type || 'type not given'} · {r.port || 'port not given'}
                </div>
                <div className="ref">
                  {r.request_reference} · lodged {new Date(r.submitted_at).toLocaleString()} · via {r.channel}
                </div>
                {r.agent_name && <div className="ref">Agent: {r.agent_name}{r.agent_phone ? ` · ${r.agent_phone}` : ''}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="chip" onClick={() => { setDeclining(declining === r.request_id ? null : r.request_id); setReason(''); }}>
                  Decline
                </button>
                <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '7px 16px' }}
                  onClick={() => triage(r)} disabled={busy === r.request_id}>
                  {busy === r.request_id ? 'Opening…' : 'Open case'}
                </button>
              </div>
            </div>

            {declining === r.request_id && (
              <div className="sub" style={{ marginTop: 10 }}>
                <label htmlFor={`why-${r.request_id}`}>Why is this being declined</label>
                <textarea id={`why-${r.request_id}`} rows={2} value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="The agent sees this when tracking the request." />
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="btn ghost" onClick={() => decline(r)} disabled={busy === r.request_id}>
                    Confirm decline
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
