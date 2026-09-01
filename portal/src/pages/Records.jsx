import React, { useState } from 'react';
import { Field, Text } from '../components/Field.jsx';
import { api } from '../api.js';

const TONE = { COMPLIANT: 'converted', DEFICIENT: 'submitted', DETAINABLE: 'declined', INCOMPLETE: 'submitted' };

/** FR-09 : an operator consults the outcomes recorded against its own hull.
 *  Scoped strictly to the IMO number supplied; no other vessel is disclosed. */
export default function Records({ go }) {
  const [imo, setImo] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  async function look(e) {
    e.preventDefault(); setFailure(null); setData(null);
    if (!/^\d{7}$/.test(imo.trim())) { setFailure('Enter the seven-digit IMO number of your vessel.'); return; }
    setBusy(true);
    try { setData(await api.vesselHistory(imo.trim())); }
    catch (err) {
      setFailure(err.status === 401 || err.status === 403
        ? 'Records for a vessel are released to its agent. Sign in, or contact inspectors for access.'
        : err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Vessel records</h1>
      <p className="lede">
        Inspections recorded against your vessel, the deficiencies raised, and the
        outcome of any waste collected on your behalf.
      </p>

      <form className="panel" onSubmit={look} noValidate style={{ marginBottom: 20 }}>
        <div className="fields">
          <Field id="imo" label="IMO number" span error={failure}>
            <Text id="imo" mono inputMode="numeric" maxLength={7} value={imo}
              onChange={e => setImo(e.target.value)} placeholder="9123456" />
          </Field>
        </div>
        <div className="actions" style={{ marginTop: 6 }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Looking…' : 'Find records'}</button>
        </div>
      </form>

      {data && data.inspections?.length === 0 && (
        <div className="notice">No inspection has been recorded against IMO {data.imo_number}.</div>
      )}

      {data && data.inspections?.map(r => (
        <div className="receipt" key={r.inspection_id} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
            <div className="ref" style={{ fontSize: 20, margin: 0 }}>MCI {r.mci_number}</div>
            <span className={`status ${TONE[r.compliance_state] || 'submitted'}`}>{r.compliance_state}</span>
          </div>
          <dl className="kv">
            <dt>Date</dt><dd>{r.inspection_date}</dd>
            <dt>Port</dt><dd>{r.port || '—'}</dd>
            <dt>Score</dt><dd>{r.compliance_score != null ? `${r.compliance_score}%` : '—'}</dd>
            <dt>Deficiencies</dt><dd>{r.deficiencies}</dd>
            <dt>Waste notes</dt><dd>{r.waste_notes}</dd>
            {Number(r.variances_beyond_tolerance) > 0 && (
              <>
                <dt>Variance</dt>
                <dd style={{ color: 'var(--danger)' }}>
                  {r.variances_beyond_tolerance} consignment(s) beyond tolerance
                </dd>
              </>
            )}
          </dl>
          {Number(r.deficiencies) > 0 && (
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => go('/corrective-action')}>Submit corrective action</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
