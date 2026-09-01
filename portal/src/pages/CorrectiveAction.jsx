import React, { useState } from 'react';
import { Field, Text } from '../components/Field.jsx';
import { api } from '../api.js';

/** FR-10 : evidence that a deficiency has been rectified. Closure is not
 *  granted here — a supervisor verifies it. A deficiency that closed itself
 *  on submission would report remediation nobody attested. */
export default function CorrectiveAction({ go }) {
  const [f, setF] = useState({ mci_number: '', deficiency_code: '', action_taken: '', contact: '' });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setFailure(null);
    const err = {};
    if (!f.mci_number.trim()) err.mci_number = 'Enter the MCI number from the inspection report.';
    if (!f.deficiency_code.trim()) err.deficiency_code = 'Enter the deficiency code shown on the report.';
    if (f.action_taken.trim().length < 20) err.action_taken = 'Describe what was done, in at least a sentence.';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      await api.submitCorrectiveAction({
        mci_number: f.mci_number.trim(), deficiency_code: f.deficiency_code.trim(),
        action_taken: f.action_taken.trim(), contact: f.contact.trim() || undefined,
        evidence_name: file ? file.name : undefined,
      });
      setDone(true);
    } catch (e2) { setFailure(e2.message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="wrap page">
        <h1>Evidence submitted</h1>
        <div className="notice">
          A supervisor will verify what you have submitted. The deficiency remains
          open until that verification is recorded, and will not close on its due date.
        </div>
        <div className="actions" style={{ marginTop: 18 }}>
          <button className="btn ghost" onClick={() => go('/records')}>Back to vessel records</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Submit corrective action</h1>
      <p className="lede">
        Tell us how a deficiency raised on your vessel was rectified. Take the MCI
        number and the deficiency code from the inspection report.
      </p>
      {failure && <div className="notice bad" role="alert" style={{ marginBottom: 18 }}>{failure}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <fieldset className="fieldset">
          <legend>Which deficiency</legend>
          <div className="fields">
            <Field id="mci_number" label="MCI number" error={errors.mci_number}>
              <Text id="mci_number" mono value={f.mci_number} onChange={set('mci_number')} />
            </Field>
            <Field id="deficiency_code" label="Deficiency code" error={errors.deficiency_code}
              hint="For example 01102">
              <Text id="deficiency_code" mono value={f.deficiency_code} onChange={set('deficiency_code')} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>What was done</legend>
          <div className="fields">
            <Field id="action_taken" label="Action taken" span error={errors.action_taken}>
              <textarea id="action_taken" rows={5} value={f.action_taken} onChange={set('action_taken')} />
            </Field>
            <Field id="evidence" label="Supporting evidence" span
              hint="A photograph, a receipt, or a replacement certificate">
              <input id="evidence" type="file" accept="image/*,.pdf"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </Field>
            <Field id="contact" label="Who to contact">
              <Text id="contact" value={f.contact} onChange={set('contact')} />
            </Field>
          </div>
        </fieldset>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit evidence'}</button>
          <button className="btn ghost" type="button" onClick={() => go('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
