import React, { useState } from 'react';
import { Field, Text, Select } from '../components/Field.jsx';
import { api } from '../api.js';

const STREAMS = [
  ['I',  'Annex I — oily water, sludge, slops'],
  ['II', 'Annex II — noxious liquid residues'],
  ['III','Annex III — harmful substances'],
  ['IV', 'Annex IV — sewage'],
  ['V',  'Annex V — garbage'],
  ['VI', 'Annex VI — ozone-depleting substances, exhaust residues'],
];
const PORTS = ['Apapa', 'Tin Can Island', 'Onne', 'Port Harcourt', 'Warri', 'Calabar'];

export default function RequestWaste({ go }) {
  const [f, setF] = useState({
    vessel_imo: '', vessel_name: '', port: PORTS[0], vessel_location: '',
    estimated_quantity: '', quantity_unit: 'CBM', containment_type: '',
    requested_date: '', contact_name: '', contact_phone: '',
  });
  const [streams, setStreams] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [failure, setFailure] = useState(null);

  const set = k => e => setF({ ...f, [k]: e.target.value });
  const toggle = code => () =>
    setStreams(s => s.includes(code) ? s.filter(x => x !== code) : [...s, code]);

  async function submit(ev) {
    ev.preventDefault();
    setFailure(null);
    const e = {};
    if (!/^\d{7}$/.test(f.vessel_imo.trim())) e.vessel_imo = 'Enter the seven-digit IMO number.';
    if (!streams.length) e.streams = 'Select at least one waste stream.';
    if (!f.contact_name.trim()) e.contact_name = 'Enter who the collection team should contact.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      // Lodged through the same intake as an inspection request, so that the
      // channel is an attribute of the request rather than a separate pathway.
      const r = await api.lodgeRequest({
        vessel_imo: f.vessel_imo.trim(),
        vessel_name: f.vessel_name.trim() || undefined,
        port: f.port,
        berth: f.vessel_location.trim() || undefined,
        preferred_date: f.requested_date || undefined,
        agent_name: f.contact_name.trim(),
        agent_phone: f.contact_phone.trim() || undefined,
        has_waste_to_land: true,
        channel: 'PORTAL',
      });
      setReceipt(r);
    } catch (err) { setFailure(err.message); } finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <div className="wrap page">
        <h1>Collection requested</h1>
        <p className="lede">
          A compliance officer will attend, inspect the vessel, and raise a controlled
          waste collection note. Your waste is then tracked from the vessel to the
          reception facility.
        </p>
        <div className="receipt">
          <div style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#4A5B63', fontWeight: 600 }}>Your reference</div>
          <div className="ref">{receipt.request_reference}</div>
          <span className="status submitted">{receipt.status}</span>
          <dl className="kv">
            <dt>Vessel</dt><dd>IMO {f.vessel_imo}</dd>
            <dt>Streams</dt><dd>{streams.map(s => `Annex ${s}`).join(', ')}</dd>
            <dt>Estimate</dt><dd>{f.estimated_quantity ? `${f.estimated_quantity} ${f.quantity_unit}` : '—'}</dd>
          </dl>
        </div>
        <div className="actions" style={{ marginTop: 22 }}>
          <button className="btn" onClick={() => go('/track')}>Track this request</button>
          <button className="btn ghost" onClick={() => go('/')}>Back to services</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Request waste collection</h1>
      <p className="lede">
        Tell us what is to be landed and roughly how much. The quantity you give here
        is compared against what is collected and what the reception facility receives.
      </p>

      {failure && <div className="notice bad" role="alert" style={{ marginBottom: 18 }}>{failure}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <fieldset className="fieldset">
          <legend>Vessel</legend>
          <div className="fields">
            <Field id="vessel_imo" label="IMO number" error={errors.vessel_imo}>
              <Text id="vessel_imo" mono inputMode="numeric" maxLength={7}
                value={f.vessel_imo} onChange={set('vessel_imo')} placeholder="9123456" />
            </Field>
            <Field id="vessel_name" label="Vessel name">
              <Text id="vessel_name" value={f.vessel_name} onChange={set('vessel_name')} />
            </Field>
            <Field id="port" label="Port">
              <Select id="port" value={f.port} onChange={set('port')}
                options={PORTS.map(p => ({ value: p, label: p }))} />
            </Field>
            <Field id="vessel_location" label="Berth, anchorage or position">
              <Text id="vessel_location" value={f.vessel_location} onChange={set('vessel_location')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>What is to be landed</legend>
          {errors.streams && <div className="err" role="alert" style={{ marginBottom: 10 }}>{errors.streams}</div>}
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {STREAMS.map(([code, label]) => (
              <div className="check" key={code}>
                <input id={`s-${code}`} type="checkbox"
                  checked={streams.includes(code)} onChange={toggle(code)} />
                <label htmlFor={`s-${code}`}>{label}</label>
              </div>
            ))}
          </div>
          <div className="fields">
            <Field id="estimated_quantity" label="Estimated quantity"
              hint="An estimate is fine; the officer records the confirmed figure">
              <Text id="estimated_quantity" mono inputMode="decimal"
                value={f.estimated_quantity} onChange={set('estimated_quantity')} />
            </Field>
            <Field id="quantity_unit" label="Unit">
              <Select id="quantity_unit" value={f.quantity_unit} onChange={set('quantity_unit')}
                options={[
                  { value: 'CBM', label: 'Cubic metres (CBM)' },
                  { value: 'L', label: 'Litres' },
                  { value: 'TONNES', label: 'Tonnes' },
                  { value: 'SACKS', label: 'Sacks' },
                ]} />
            </Field>
            <Field id="containment_type" label="How is it contained">
              <Select id="containment_type" value={f.containment_type} onChange={set('containment_type')}
                options={[
                  { value: '', label: 'Select' },
                  { value: 'LIQUID', label: 'Liquid, in tank' },
                  { value: 'DRUM', label: 'Drums' },
                  { value: 'REFUSE_SACKS', label: 'Refuse sacks' },
                  { value: 'BULK', label: 'Bulk' },
                  { value: 'DRY', label: 'Dry' },
                  { value: 'OTHER', label: 'Other' },
                ]} />
            </Field>
            <Field id="requested_date" label="Preferred collection date">
              <Text id="requested_date" type="date" value={f.requested_date} onChange={set('requested_date')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Who to contact</legend>
          <div className="fields">
            <Field id="contact_name" label="Contact name" error={errors.contact_name}>
              <Text id="contact_name" value={f.contact_name} onChange={set('contact_name')} />
            </Field>
            <Field id="contact_phone" label="Telephone">
              <Text id="contact_phone" mono value={f.contact_phone} onChange={set('contact_phone')} />
            </Field>
          </div>
        </fieldset>

        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Lodging…' : 'Request collection'}
          </button>
          <button className="btn ghost" type="button" onClick={() => go('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
