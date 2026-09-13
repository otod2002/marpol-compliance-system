import React, { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { clearDevice } from '../db.js';

/** FR-44 : verification of corrective action. Closure requires this act.
 *  A deficiency does not close on the elapse of its due date, because one
 *  that closed itself would report remediation nobody attested.
 *
 *  Added here: the masthead, same gap already found and fixed in
 *  Admin.jsx, Triage.jsx and Supervisor.jsx. */
export default function Verify({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

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

  const load = async () => {
    const r = await get('/corrective-actions');
    if (r.ok) setRows(r.body); else setMsg({ bad: true, text: r.body.error });
  };
  useEffect(() => { load(); }, []);

  async function decide(ca, accept) {
    setBusy(ca.ca_id);
    const r = await post(`/corrective-actions/${ca.ca_id}/verify`,
      { accept, outcome: note[ca.ca_id] || '' });
    setBusy(null);
    // Fixed here: post() returns { status, body } — it has no .ok field.
    // Same class of bug already fixed in Supervisor.jsx and Triage.jsx.
    if (r.status === 200) {
      setMsg({ text: accept
        ? `Deficiency ${ca.deficiency_code} closed on MCI ${ca.mci_number}.`
        : `Evidence not accepted. Deficiency ${ca.deficiency_code} remains open.` });
      load();
    } else setMsg({ bad: true, text: (r.body && r.body.error) || 'Could not record the decision.' });
  }

  return (
    <>
      <header className="masthead field">
        <div className="masthead-inner">
          <div className="brand-text">
            <span className="brand-name">Marpol Field</span>
            <span className="brand-sub">{me?.full_name} &middot; Supervisor</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <button className="btn ghost small" onClick={() => go('/queue')}>Queue</button>
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
      <h1>Corrective action</h1>
      <p className="lede">
        Evidence submitted by vessels against deficiencies raised on inspection.
        Nothing closes until it is verified here.
      </p>
      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      {rows.length === 0 && <div className="panel"><div className="center">Nothing awaiting verification.</div></div>}

      {rows.map(ca => (
        <div className={`item ${ca.is_detention ? 'nonconforming' : ''}`} key={ca.ca_id}>
          <div className="code">{ca.item_code} · {ca.deficiency_code}</div>
          <div className="req">{ca.requirement_text}</div>
          <div className="cite">
            {ca.vessel_name} · IMO {ca.imo_number} · MCI {ca.mci_number}
            {ca.is_detention && ' · DETAINABLE'}
          </div>

          <div className="sub">
            <label>What the vessel reports</label>
            <p style={{ margin: '0 0 10px', fontSize: 15 }}>{ca.action_taken}</p>
            <div className="ref">
              Submitted {new Date(ca.submitted_at).toLocaleString()}
              {ca.assigned_to ? ` · contact ${ca.assigned_to}` : ''}
              {ca.evidence_path ? ` · evidence attached` : ' · no evidence attached'}
            </div>

            <div style={{ marginTop: 12 }}>
              <label htmlFor={`n-${ca.ca_id}`}>Verification note</label>
              <textarea id={`n-${ca.ca_id}`} rows={2} value={note[ca.ca_id] || ''}
                onChange={e => setNote({ ...note, [ca.ca_id]: e.target.value })}
                placeholder="What you checked, and how." />
            </div>

            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy === ca.ca_id} onClick={() => decide(ca, true)}>
                {busy === ca.ca_id ? 'Recording…' : 'Verify and close'}
              </button>
              <button className="btn ghost" disabled={busy === ca.ca_id} onClick={() => decide(ca, false)}>
                Not accepted
              </button>
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
