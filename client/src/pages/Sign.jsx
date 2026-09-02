import React, { useEffect, useState } from 'react';
import { getInspection, patchInspection, enqueue } from '../db.js';
import { releaseQueue } from '../sync.js';

/**
 * FIXED — this screen originally captured only ONE signature, chosen from
 * a dropdown of three roles, before queuing the inspection. That was
 * wrong: per the person's own domain requirement, this form is the
 * binding record of work done, and it is not valid until BOTH the vessel
 * (Master or Chief Officer) and NIMASA (the attending inspector) have
 * signed it — not one or the other. Every other layer of the system was
 * already built correctly for this: the `signatory` table keys on
 * (document, role) so multiple roles genuinely mean multiple signatures,
 * the server's sync handler already loops over every signatory it's
 * given, and Receipt.jsx already renders one box per signature. This was
 * the one screen not asking for both. No mockup exists for this screen
 * (see the original note this replaced), so the two-block layout below is
 * still a judgment call on presentation, not on the underlying
 * requirement — that part is now correct.
 */
const REQUIRED_ROLES = [
  ['MASTER_OR_CHIEF_OFFICER', 'Master or Chief Officer', 'On behalf of the vessel'],
  ['NIMASA_INSPECTOR', 'NIMASA Inspector', 'On behalf of the Agency'],
];

export default function Sign({ localId, go }) {
  const [insp, setInsp] = useState(null);
  const [names, setNames] = useState({ MASTER_OR_CHIEF_OFFICER: '', NIMASA_INSPECTOR: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getInspection(localId).then(setInsp); }, [localId]);

  const missing = REQUIRED_ROLES.filter(([role]) => !names[role].trim());

  async function submit(ev) {
    ev.preventDefault();
    if (missing.length) {
      setError(`Both signatures are required before this form is valid. Missing: ${missing.map(m => m[1]).join(', ')}.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await patchInspection(localId, {
        signatories: REQUIRED_ROLES.map(([role]) => ({ signatory_role: role, name: names[role].trim() })),
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
        {insp.vessel?.vessel_name} &middot; {insp.case_reference}. This form is not
        valid until both parties sign. Once signed, it queues for
        synchronisation and will send automatically once the device is online.
      </p>

      {error && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        {REQUIRED_ROLES.map(([role, label, sub], i) => (
          <div key={role} style={i > 0 ? { marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--line)' } : undefined}>
            <label htmlFor={`sig-${role}`} style={{ fontWeight: 600 }}>{label}</label>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>{sub}</div>
            <input
              id={`sig-${role}`}
              placeholder="Full name"
              value={names[role]}
              onChange={e => setNames(n => ({ ...n, [role]: e.target.value }))}
              required
            />
          </div>
        ))}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 22, width: '100%' }}>
          {busy ? 'Queuing…' : 'Sign and queue for sync'}
        </button>
      </form>
    </div>
  );
}
