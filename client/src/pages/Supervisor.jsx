import React, { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { clearDevice } from '../db.js';

const ROLE_LABEL = { SUPERVISOR: 'Supervisor', ADMINISTRATOR: 'Administrator' };

/** Supervisory desk: submissions awaiting approval (FR-39) and consignments
 *  whose reconciled variance exceeded tolerance (FR-42). A definitive MCI
 *  report is issued only after approval, so this screen gates the report.
 *
 *  Added here: the masthead, same gap already found and fixed once in
 *  Admin.jsx and again in Triage.jsx — this screen had none either, so
 *  there was no way back to the queue or to sign out once here. No
 *  mockup was provided for this specific screen, so the masthead follows
 *  the established pattern from the screens that do have one, rather
 *  than inventing a different layout for this page alone. */
export default function Supervisor({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState([]);
  const [variances, setVariances] = useState([]);
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

  // Fixed here: get() throws on a non-2xx response and returns the parsed
  // body directly on success — it does not return a { ok, body } shape.
  // Same contract mismatch already fixed in Admin.jsx; see that file's
  // comment for why. Promise.allSettled rather than Promise.all so that
  // one endpoint failing (e.g. a non-supervisor somehow reaching this
  // screen) doesn't blank out the other panel too.
  const load = async () => {
    const [p, v] = await Promise.allSettled([
      get('/inspections?status=PENDING'),
      get('/reconciliations/variances'),
    ]);
    if (p.status === 'fulfilled') setPending(p.value); else setMsg({ bad: true, text: p.reason.message });
    if (v.status === 'fulfilled') setVariances(v.value); else setMsg({ bad: true, text: v.reason.message });
  };
  useEffect(() => { load(); }, []);

  async function approve(id) {
    // Fixed here: post() returns { status, body } — it has no .ok field
    // (only patch() does). Checking r.ok meant this branch was always
    // truthy (undefined is falsy, so !r.ok was always true), so approval
    // would have reported failure even when the server returned 200.
    const r = await post(`/inspections/${id}/approve`, { approve: true });
    if (r.status !== 200) { setMsg({ bad: true, text: (r.body && r.body.error) || 'Could not approve.' }); return; }
    const g = await post(`/inspections/${id}/report`, {});
    setMsg(g.status === 201
      ? { text: 'Approved. The definitive MCI report has been generated.' }
      : { bad: true, text: (g.body && g.body.error) || 'Approved, but the report could not be generated.' });
    load();
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
      <h1>Supervisory desk</h1>
      <p className="lede">
        Approve submissions and review consignments whose declared and received
        quantities differ beyond tolerance.
      </p>
      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <h2>Awaiting approval</h2>
      <div className="panel">
        {pending.length === 0 && <div className="center">Nothing awaiting approval.</div>}
        {pending.map(i => (
          <div className="row" key={i.inspection_id}>
            <div>
              <strong>{i.vessel_name}</strong>
              <div className="ref">
                MCI {i.mci_number} · {i.inspection_date} · {i.compliance_state}
                {i.compliance_score != null ? ` · ${i.compliance_score}%` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {i.compliance_state === 'DETAINABLE' && <span className="badge expired">Detainable</span>}
              <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '7px 16px' }}
                onClick={() => approve(i.inspection_id)}>Approve</button>
            </div>
          </div>
        ))}
      </div>

      <h2>Variance beyond tolerance</h2>
      <div className="panel">
        {variances.length === 0 && <div className="center">No consignment is outside tolerance.</div>}
        {variances.map(v => (
          <div className="row" key={v.recon_id}>
            <div>
              <strong>{v.vessel_name}</strong>
              <div className="ref">
                Note {v.wcn_number} · IMO {v.imo_number} · declared {v.declared_quantity ?? '—'} ·
                received {v.received_quantity ?? '—'}
              </div>
            </div>
            <span className="badge expired">
              {v.variance_flag === 'UNIT_MISMATCH' ? 'Unit mismatch' : `${v.variance_percent}%`}
            </span>
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
