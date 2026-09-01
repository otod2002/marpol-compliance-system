import React, { useState } from 'react';
import { Field, Text, Select } from '../components/Field.jsx';
import { api } from '../api.js';

const CATEGORIES = [
  ['', 'Select a subject'],
  ['INSPECTION', 'An inspection or its findings'],
  ['CERTIFICATE', 'A certificate or record book'],
  ['WASTE', 'Waste collection or delivery'],
  ['REQUEST', 'A request I lodged'],
  ['OTHER', 'Something else'],
];

/** FR-13 : an enquiry addressed to inspectors, kept as a thread so a reply
 *  attaches to the question rather than arriving as a loose message. */
export default function Enquiry({ go }) {
  const [f, setF] = useState({ subject: '', category: '', vessel_imo: '', sender_name: '', sender_email: '', sender_phone: '', body: '' });
  const [errors, setErrors] = useState({});
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setFailure(null);
    const err = {};
    if (!f.subject.trim()) err.subject = 'Give the enquiry a subject.';
    if (!f.category) err.category = 'Choose what this is about.';
    if (!f.sender_name.trim()) err.sender_name = 'Enter your name.';
    if (!f.sender_email.trim() && !f.sender_phone.trim()) err.sender_email = 'Give an email or a telephone number so we can reply.';
    if (f.body.trim().length < 15) err.body = 'Say a little more, so an inspector can answer without writing back for detail.';
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try { setRef((await api.raiseEnquiry(f)).thread_reference); }
    catch (e2) { setFailure(e2.message); } finally { setBusy(false); }
  }

  if (ref) {
    return (
      <div className="wrap page">
        <h1>Enquiry received</h1>
        <p className="lede">An inspector will reply to the contact details you gave.</p>
        <div className="receipt">
          <div style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#4A5B63', fontWeight: 600 }}>Your reference</div>
          <div className="ref">{ref}</div>
        </div>
        <div className="actions" style={{ marginTop: 20 }}>
          <button className="btn ghost" onClick={() => go('/')}>Back to services</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Contact inspectors</h1>
      <p className="lede">
        Ask about an inspection, a certificate, or a waste consignment. If your
        question is about a specific vessel, give the IMO number and the reply will
        reach you faster.
      </p>
      {failure && <div className="notice bad" role="alert" style={{ marginBottom: 18 }}>{failure}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <div className="fields">
          <Field id="subject" label="Subject" error={errors.subject}>
            <Text id="subject" value={f.subject} onChange={set('subject')} />
          </Field>
          <Field id="category" label="What is this about" error={errors.category}>
            <Select id="category" value={f.category} onChange={set('category')}
              options={CATEGORIES.map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field id="vessel_imo" label="IMO number" hint="If this concerns a vessel">
            <Text id="vessel_imo" mono maxLength={7} value={f.vessel_imo} onChange={set('vessel_imo')} />
          </Field>
          <Field id="sender_name" label="Your name" error={errors.sender_name}>
            <Text id="sender_name" value={f.sender_name} onChange={set('sender_name')} />
          </Field>
          <Field id="sender_email" label="Email" error={errors.sender_email}>
            <Text id="sender_email" type="email" value={f.sender_email} onChange={set('sender_email')} />
          </Field>
          <Field id="sender_phone" label="Telephone">
            <Text id="sender_phone" mono value={f.sender_phone} onChange={set('sender_phone')} />
          </Field>
          <Field id="body" label="Your question" span error={errors.body}>
            <textarea id="body" rows={6} value={f.body} onChange={set('body')} />
          </Field>
        </div>
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'}</button>
          <button className="btn ghost" type="button" onClick={() => go('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
