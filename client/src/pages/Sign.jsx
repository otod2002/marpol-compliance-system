import React, { useEffect, useState } from 'react';
import { getInspection, patchInspection, enqueue } from '../db.js';
import { releaseQueue } from '../sync.js';
import SignaturePad from '../components/SignaturePad.jsx';

/**
 * Sign-off. The form is the binding record of work done aboard, and it is
 * not valid until both the vessel (Master or Chief Officer) and NIMASA (the
 * attending inspector) have signed it.
 *
 * Each party gives two things: a printed name and a written signature drawn
 * on the screen. The name is what appears in the record and in any later
 * search; the drawn mark is what the Master expects to make on a form they
 * are handed, and is stored alongside the name in signatory.signature_path.
 * Both are captured on the device with no network, which is the condition
 * the whole field application is built for.
 */
const REQUIRED_ROLES = [
  ['MASTER_OR_CHIEF_OFFICER', 'Master or Chief Officer', 'On behalf of the vessel'],
  ['NIMASA_INSPECTOR', 'NIMASA Inspector', 'On behalf of the Agency'],
];

export default function Sign({ localId, go }) {
  const [insp, setInsp] = useState(null);
  const [names, setNames] = useState({ MASTER_OR_CHIEF_OFFICER: '', NIMASA_INSPECTOR: '' });
  const [marks, setMarks] = useState({ MASTER_OR_CHIEF_OFFICER: null, NIMASA_INSPECTOR: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { getInspection(localId).then(setInsp); }, [localId]);

  const missingNames = REQUIRED_ROLES.filter(([role]) => !names[role].trim());
  const missingMarks = REQUIRED_ROLES.filter(([role]) => !marks[role]);

  async function submit(ev) {
    ev.preventDefault();
    if (missingNames.length || missingMarks.length) {
      const parts = [];
      if (missingNames.length) parts.push(`name for ${missingNames.map(m => m[1]).join(' and ')}`);
      if (missingMarks.length) parts.push(`signature for ${missingMarks.map(m => m[1]).join(' and ')}`);
      setError(`This form is not valid until both parties sign. Missing: ${parts.join('; ')}.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await patchInspection(localId, {
        signatories: REQUIRED_ROLES.map(([role]) => ({
          signatory_role: role,
          name: names[role].trim(),
          signature_path: marks[role],
        })),
        status: 'COMPLETE',
      });
      await enqueue(localId);
      releaseQueue().catch(() => {}); // best-effort immediate attempt; retried by startAutoSync otherwise
      // Handover.jsx hands over BOTH documents (report and waste note where
      // applicable) and explains that both are provisional.
      go(`/handover/${localId}`);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  if (!insp) return <div className="wrap center">Loading…</div>;

  return (
    <div className="wrap page" style={{ maxWidth: 560 }}>
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
          <div key={role} style={i > 0 ? { marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--line)' } : undefined}>
            <label htmlFor={`sig-${role}`} style={{ fontWeight: 600 }}>{label}</label>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>{sub}</div>
            <input
              id={`sig-${role}`}
              placeholder="Full name"
              value={names[role]}
              onChange={e => setNames(n => ({ ...n, [role]: e.target.value }))}
              required
            />
            <SignaturePad
              label="Signature"
              hint="Sign with a finger or a stylus."
              value={marks[role]}
              onChange={data => setMarks(m => ({ ...m, [role]: data }))}
            />
          </div>
        ))}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 24, width: '100%' }}>
          {busy ? 'Queuing…' : 'Sign and queue for sync'}
        </button>
      </form>
    </div>
  );
}
