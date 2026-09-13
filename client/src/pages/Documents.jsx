import React, { useEffect, useState } from 'react';
import { get, post, downloadPdf } from '../api.js';

/**
 * DOCUMENT REGISTER
 *
 * Where the MCI reports and controlled waste collection notes are found and
 * downloaded. It exists because generating a document and being able to
 * retrieve one are different capabilities, and the system had the first
 * without the second.
 *
 * The register distinguishes three states deliberately, because the reason a
 * document is unavailable determines what the user should do about it: an
 * unsynchronised record needs the officer's device to reconnect, an
 * unapproved one needs a supervisor, and an approved one needs nothing at all.
 */
const STATE = {
  AVAILABLE:         ['Available', 'valid'],
  READY_TO_GENERATE: ['Ready', 'soon'],
  AWAITING_APPROVAL: ['Awaiting approval', 'grey'],
  NOT_SYNCHRONISED:  ['Not yet synchronised', 'expired'],
};

export default function Documents({ me, go }) {
  const [data, setData] = useState(null);
  const [imo, setImo] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [send, setSend] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const load = async (filter = '') => {
    const r = await get(`/documents${filter ? `?imo=${encodeURIComponent(filter)}` : ''}`);
    if (r.ok) setData(r.body); else setMsg({ bad: true, text: r.body.error });
  };
  useEffect(() => { load(); }, []);

  const canApprove = me.role === 'SUPERVISOR' || me.role === 'ADMINISTRATOR';

  async function getReport(row) {
    setBusy(row.inspection_id); setMsg(null);
    try {
      let reportId = row.report_id;
      if (!reportId) {
        const r = await post(`/inspections/${row.inspection_id}/report/ensure`, {});
        if (r.status === 409) {
          setMsg({ bad: true, text: r.body.note || r.body.error });
          setBusy(null); return;
        }
        if (!r.ok) { setMsg({ bad: true, text: r.body.error }); setBusy(null); return; }
        reportId = r.body.report_id;
      }
      await downloadPdf(`/reports/${reportId}.pdf`, `MCI-${row.mci_number}.pdf`);
      setMsg({ text: `MCI ${row.mci_number} downloaded.` });
      load(imo);
    } catch (e) { setMsg({ bad: true, text: e.message }); } finally { setBusy(null); }
  }

  /** Compose a delivery to the vessel's agent. Sending is separated from
   *  composing: where no mail transport is configured the message is retained
   *  in the outbox, which is demonstrable without a live mail server.
   *
   *  FIXED — this called POST /inspections/:id/deliver with a field named
   *  recipient_email, but the real, schema-consistent endpoint (delivery.js,
   *  matching migration 003) is POST /inspections/:id/send, expecting a
   *  field named recipient. This would have 404'd on every attempt. */
  async function deliver(row) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setMsg({ bad: true, text: 'Enter a valid email address for the agent or master.' });
      return;
    }
    setBusy(row.inspection_id); setMsg(null);
    const r = await post(`/inspections/${row.inspection_id}/send`, {
      recipient: email.trim(),
      recipient_name: name.trim() || undefined,
      include_waste_notes: true,
    });
    setBusy(null);
    if (r.status === 201) {
      setSend(null); setEmail(''); setName('');
      setMsg({ text: `${r.body.links.length} document link(s) composed for ${r.body.recipient}. ${r.body.note}` });
    } else {
      setMsg({ bad: true, text: (r.body && (r.body.note || r.body.error)) || 'Could not compose the delivery.' });
    }
  }

  async function getNote(row) {
    setBusy(row.wcn_id); setMsg(null);
    try {
      await downloadPdf(`/waste-notes/${row.wcn_id}/note.pdf`, `WCN-${row.wcn_number}.pdf`);
      setMsg({ text: `Waste note ${row.wcn_number} downloaded.` });
    } catch (e) { setMsg({ bad: true, text: e.message }); } finally { setBusy(null); }
  }


  return (
    <div className="wrap page">
      <h1>Documents</h1>
      <p className="lede">
        MARPOL Compliance Inspection reports and controlled waste collection notes.
        A report is issued only after supervisory approval; until then the Master
        holds the provisional receipt generated on the inspecting device.
      </p>

      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <div className="panel">
        <label htmlFor="f">Filter by IMO number</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input id="f" className="mono" inputMode="numeric" maxLength={7} value={imo}
            onChange={e => setImo(e.target.value)} placeholder="all vessels" />
          <button className="btn ghost" onClick={() => load(imo.trim())}>Apply</button>
        </div>
      </div>

      <h2>Inspection reports</h2>
      <div className="panel">
        {!data && <div className="center">Loading…</div>}
        {data && data.inspections.length === 0 && <div className="center">No inspections recorded.</div>}
        {data && data.inspections.map(r => {
          const [label, tone] = STATE[r.document_state] || ['Unknown', 'grey'];
          const downloadable = r.document_state === 'AVAILABLE'
            || (r.document_state === 'READY_TO_GENERATE' && canApprove);
          return (
            <React.Fragment key={r.inspection_id}>
            <div className="row">
              <div>
                <strong>MCI {r.mci_number}</strong> &middot; {r.vessel_name}
                <div className="ref">
                  IMO {r.imo_number} · {r.inspection_date} · {r.port || '—'} · {r.compliance_state}
                </div>
                {r.document_state === 'AWAITING_APPROVAL' && (
                  <div className="ref" style={{ color: 'var(--ink-2)' }}>
                    A supervisor must approve this inspection before a report is issued.
                  </div>
                )}
                {r.document_state === 'NOT_SYNCHRONISED' && (
                  <div className="ref" style={{ color: 'var(--danger)' }}>
                    Still held on an inspecting device. Nothing can be produced until it synchronises.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${tone}`}>{label}</span>
                {r.document_state === 'AWAITING_APPROVAL' && canApprove && (
                  <button className="chip" onClick={() => go('/supervisor')}>Approve</button>
                )}
                {(r.document_state === 'AVAILABLE' || r.document_state === 'READY_TO_GENERATE') && (
                  <button className="chip"
                    onClick={() => { setSend(send === r.inspection_id ? null : r.inspection_id); setMsg(null); }}>
                    Send
                  </button>
                )}
                {downloadable && (
                  <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '7px 15px' }}
                    onClick={() => getReport(r)} disabled={busy === r.inspection_id}>
                    {busy === r.inspection_id ? 'Preparing…' : 'Download'}
                  </button>
                )}
              </div>
            </div>
            {/* ADDED — the Send button above toggled this state, but no
                form ever rendered for it: deliver() was fully wired to a
                real, working endpoint with nothing in the UI able to call
                it. Confirmed by clicking through the actual running page,
                not just by reading the file. */}
            {send === r.inspection_id && (
              <div className="sub" style={{ marginTop: 10 }}>
                <div className="grid2">
                  <div>
                    <label htmlFor={`send-email-${r.inspection_id}`}>Agent or Master's email</label>
                    <input id={`send-email-${r.inspection_id}`} type="email" value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="agent@example.com" />
                  </div>
                  <div>
                    <label htmlFor={`send-name-${r.inspection_id}`}>Name (optional)</label>
                    <input id={`send-name-${r.inspection_id}`} value={name}
                      onChange={e => setName(e.target.value)} />
                  </div>
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn small" disabled={busy === r.inspection_id}
                    onClick={() => deliver(r)}>
                    {busy === r.inspection_id ? 'Composing…' : 'Compose and queue'}
                  </button>
                  <button className="btn ghost small" onClick={() => { setSend(null); setEmail(''); setName(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            </React.Fragment>
          );
        })}
      </div>

      <h2>Waste collection notes</h2>
      <p className="lede" style={{ marginTop: -4 }}>
        A note may be downloaded at any stage. It records a custody transfer rather
        than a regulatory finding, so it does not wait on approval.
      </p>
      <div className="panel">
        {data && data.waste_notes.length === 0 && <div className="center">No waste collection notes raised.</div>}
        {data && data.waste_notes.map(w => (
          <div className="row" key={w.wcn_id}>
            <div>
              <strong>Note {w.wcn_number}</strong> &middot; {w.vessel_name}
              <div className="ref">
                IMO {w.imo_number} · MCI {w.mci_number} · stage {w.custody_stage}
                {w.booked_date ? ` · booked ${w.booked_date}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {w.variance_flag && w.variance_flag !== 'WITHIN_TOLERANCE' && (
                <span className="badge expired">
                  {w.variance_flag === 'UNIT_MISMATCH' ? 'Unit mismatch' : `${w.variance_percent}%`}
                </span>
              )}
              <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '7px 15px' }}
                onClick={() => getNote(w)} disabled={busy === w.wcn_id}>
                {busy === w.wcn_id ? 'Preparing…' : 'Download'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
