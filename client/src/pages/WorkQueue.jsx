import React, { useEffect, useState } from 'react';
import { listInspections, createInspection, clearDevice } from '../db.js';
import { fetchWorkQueue, get } from '../api.js';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES, but built to match
 * pwa-work-queue.png exactly (section titles, empty state, card layout).
 * Backed by server/src/routes/cases.js, also a draft — see that file's
 * header comment for what's unverified about it.
 *
 * ADDED (not in the original mockup, which only showed a compliance
 * officer's view): a "Consignments" section for WASTE_TEAM_LEADER and
 * FACILITY_RECEIVER, since those roles have nothing to inspect but do
 * have waste custody stages to attest — without this they would sign in
 * to an empty queue with no way to reach WasteNote.jsx at all.
 */
export default function WorkQueue({ user, pack, onOpen, onOpenWasteNote, onSignedOut }) {
  const [onDevice, setOnDevice] = useState([]);
  const [remote, setRemote] = useState(null);
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const isWasteRole = user?.role === 'WASTE_TEAM_LEADER' || user?.role === 'FACILITY_RECEIVER';

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { listInspections().then(setOnDevice); }, []);

  useEffect(() => {
    if (isWasteRole) {
      get('/waste-notes').then(setNotes).catch(e => setError(e.message));
    } else {
      fetchWorkQueue().then(setRemote).catch(e => setError(e.message));
    }
  }, [isWasteRole]);

  async function start(caseRow) {
    // template_id/version come from the cached instrument pack (fetched at
    // sign-in in App.jsx): both Inspection.jsx's rule evaluation and the
    // server's /inspections/sync schema require them on every inspection.
    // Fixed here — the original draft passed null/null, which would have
    // made every inspection fail server-side validation on sync.
    if (!pack?.template?.template_id) {
      setError('Instrument pack has not downloaded yet. Reconnect and reopen the app before starting an inspection.');
      return;
    }
    const rec = await createInspection({
      case_id: caseRow.case_id,
      case_reference: caseRow.case_reference,
      vessel: {
        vessel_name: caseRow.vessel_name, imo_number: caseRow.imo_number,
        vessel_type: caseRow.vessel_type, grt: caseRow.grt,
        flag_state: caseRow.flag_state, is_nigerian_flag: caseRow.is_nigerian_flag,
      },
      template_id: pack.template.template_id,
      template_version: pack.template.version,
    });
    onOpen(rec.local_id);
  }

  async function signOut() {
    await clearDevice();
    onSignedOut();
  }

  return (
    <>
      <header className="masthead field">
        <div className="masthead-inner">
          <div className="brand-text">
            <span className="brand-name">Marpol Field</span>
            <span className="brand-sub">{user?.full_name} &middot; {roleLabel(user?.role)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            {(user?.role === 'COMPLIANCE_OFFICER' || user?.role === 'SUPERVISOR') && (
              <button className="btn ghost small" onClick={() => (window.location.hash = '#/triage')}>New requests</button>
            )}
            {user?.role === 'ADMINISTRATOR' && (
              <button className="btn ghost small" onClick={() => (window.location.hash = '#/admin')}>Accounts</button>
            )}
            {user?.role === 'SUPERVISOR' && (
              <button className="btn ghost small" onClick={() => (window.location.hash = '#/supervisor')}>Supervisor</button>
            )}
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
        <h1>Work queue</h1>
        <p className="lede">
          {isWasteRole
            ? 'Consignments awaiting the stage you attest.'
            : 'Inspections held on this device, and cases awaiting attendance.'}
        </p>

        {!isWasteRole && (
          <>
            <h2 className="section-h">On this device</h2>
            <div className="panel" style={{ minHeight: 90 }}>
              {onDevice.length === 0
                ? <p className="empty">No inspections held on this device.</p>
                : onDevice.map(i => (
                  <div className="queue-row" key={i.local_id} onClick={() => onOpen(i.local_id)}>
                    <div>
                      <strong>{i.vessel?.vessel_name || 'Unnamed vessel'}</strong>
                      <div className="mono meta">
                        IMO {i.vessel?.imo_number || '—'} &middot; {i.case_reference}
                      </div>
                    </div>
                    <span className={`status ${i.status?.toLowerCase()}`}>{i.status}</span>
                  </div>
                ))}
            </div>

            <h2 className="section-h">Awaiting attendance</h2>
            <div className="panel" style={{ minHeight: 90 }}>
              {error && <p className="empty" style={{ color: 'var(--danger)' }}>{error}</p>}
              {!error && remote === null && <p className="empty">Loading…</p>}
              {!error && remote && remote.length === 0 && <p className="empty">Nothing awaiting attendance.</p>}
              {!error && remote && remote.map(c => (
                <div className="queue-row" key={c.case_id}>
                  <div>
                    <strong>{c.vessel_name}</strong>
                    <div className="mono meta">
                      IMO {c.imo_number} &middot; {c.port || '—'} &middot; {c.request_reference || c.case_reference}
                    </div>
                  </div>
                  <button className="btn small" onClick={() => start(c)}>Start</button>
                </div>
              ))}
            </div>
          </>
        )}

        {isWasteRole && (
          <>
            <h2 className="section-h">Consignments</h2>
            <div className="panel" style={{ minHeight: 90 }}>
              {error && <p className="empty" style={{ color: 'var(--danger)' }}>{error}</p>}
              {!error && notes === null && <p className="empty">Loading…</p>}
              {!error && notes && notes.length === 0 && <p className="empty">Nothing awaiting your attestation.</p>}
              {!error && notes && notes.map(n => (
                <div className="queue-row" key={n.wcn_id} onClick={() => onOpenWasteNote(n.wcn_id)}>
                  <div>
                    <strong>{n.vessel_name}</strong>
                    <div className="mono meta">
                      IMO {n.imo_number} &middot; Note {n.wcn_number} &middot; {n.general_description || 'waste'}
                    </div>
                  </div>
                  <span className="badge soon">{n.custody_stage}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function roleLabel(role) {
  return {
    COMPLIANCE_OFFICER: 'Compliance officer', SUPERVISOR: 'Supervisor', ADMINISTRATOR: 'Administrator',
    WASTE_TEAM_LEADER: 'Waste team leader', FACILITY_RECEIVER: 'Facility receiver',
  }[role] || role || '';
}
