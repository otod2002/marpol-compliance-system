import React, { useEffect, useState } from 'react';
import { getInspection, patchInspection, enqueue } from '../db.js';
import { releaseQueue } from '../sync.js';

/**
 * DRAFT — NO MOCKUP EXISTS FOR THIS SCREEN. Unlike every other page in this
 * bundle, I have nothing to match this against — no pwa-sign.png was
 * provided, and Inspection.jsx's go(`/sign/${localId}`) call is the only
 * evidence this screen should exist at all. What it collects (voyage
 * particulars, a signatory name/role) is taken directly from the fields
 * server/src/routes/inspections.js's sync schema requires — so the DATA
 * this screen gathers is grounded in something real, but the LAYOUT, the
 * copy, and the overall flow are my invention, not yours. Treat this as
 * the roughest of all the drafts in this batch, and expect to redesign it
 * once you decide what this screen should actually look and read like.
 */
export default function Sign({ localId, go }) {
  const [insp, setInsp] = useState(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('MASTER_OR_CHIEF_OFFICER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getInspection(localId).then(setInsp); }, [localId]);

  async function submit(ev) {
    ev.preventDefault();
    if (!name.trim()) { setError('Enter the signatory\u2019s name.'); return; }
    setError(null);
    setBusy(true);
    try {
      await patchInspection(localId, {
        signatories: [{ signatory_role: role, name: name.trim() }],
        status: 'COMPLETE',
      });
      await enqueue(localId);
      releaseQueue().catch(() => {}); // best-effort immediate attempt; retried by startAutoSync otherwise
      // Route to the provisional receipt (Receipt.jsx) rather than straight
      // back to the queue — the Master needs that document handed over
      // before the officer leaves the vessel, per Receipt.jsx's own header.
      go(`/receipt/${localId}`);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  if (!insp) return <div className="wrap center">Loading…</div>;

  return (
    <div className="wrap page" style={{ maxWidth: 520 }}>
      <a className="back" href="#" onClick={e => { e.preventDefault(); go(`/inspection/${localId}`); }}>
        &larr; Back to inspection
      </a>
      <h1>Complete inspection</h1>
      <p className="lede">
        {insp.vessel?.vessel_name} &middot; {insp.case_reference}. This queues the
        inspection for synchronisation; it will send automatically once the
        device is online.
      </p>

      {error && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="signatory-role">Signing as</label>
          <select id="signatory-role" value={role} onChange={e => setRole(e.target.value)}>
            <option value="MASTER_OR_CHIEF_OFFICER">Master or chief officer</option>
            <option value="NIMASA_INSPECTOR">NIMASA inspector</option>
            <option value="MARPOL_COMPLIANCE_INSPECTOR">MARPOL compliance inspector</option>
          </select>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="signatory-name">Name</label>
          <input id="signatory-name" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 18, width: '100%' }}>
          {busy ? 'Queuing…' : 'Sign and queue for sync'}
        </button>
      </form>
    </div>
  );
}
