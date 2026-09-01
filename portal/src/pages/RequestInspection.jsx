import React, { useState } from 'react';
import { Field, Text, Select } from '../components/Field.jsx';
import { api } from '../api.js';

const PORTS = ['Apapa', 'Tin Can Island', 'Onne', 'Port Harcourt', 'Warri', 'Calabar'];
const TYPES = [
  ['', 'Select a type'],
  ['GENERAL_CARGO', 'General cargo'],
  ['CONTAINER', 'Container'],
  ['OIL_TANKER', 'Oil tanker'],
  ['CHEMICAL_TANKER', 'Chemical tanker'],
  ['NLS_TANKER', 'NLS tanker'],
  ['BULK_CARRIER', 'Bulk carrier'],
  ['REEFER', 'Reefer'],
  ['RORO', 'Ro-Ro'],
  ['OFFSHORE_SUPPORT', 'Offshore support'],
  ['OTHER', 'Other'],
];

/** An IMO number is seven digits; the seventh is a check digit whose weights
 *  run 7 down to 2. Validating it here means an agent finds a mistyped hull
 *  number immediately rather than after an officer has been dispatched. */
function imoValid(v) {
  if (!/^\d{7}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const sum = d.slice(0, 6).reduce((a, n, i) => a + n * (7 - i), 0);
  return sum % 10 === d[6];
}

export default function RequestInspection({ go }) {
  const [f, setF] = useState({
    vessel_imo: '', vessel_name: '', flag_state: '', vessel_type: '', gross_tonnage: '',
    port: PORTS[0], berth: '', preferred_date: '', preferred_time_window: '',
    agent_name: '', agent_email: '', agent_phone: '', has_waste_to_land: false,
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [failure, setFailure] = useState(null);

  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function validate() {
    const e = {};
    if (!f.vessel_imo.trim()) e.vessel_imo = 'Enter the vessel IMO number.';
    else if (!imoValid(f.vessel_imo.trim())) e.vessel_imo = 'That is not a valid IMO number. Check the seven digits.';
    if (!f.vessel_name.trim()) e.vessel_name = 'Enter the vessel name.';
    if (!f.vessel_type) e.vessel_type = 'Select the vessel type. It determines which Annexes apply.';
    if (!f.agent_name.trim()) e.agent_name = 'Enter the name of the agent or master lodging this request.';
    if (f.agent_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.agent_email)) e.agent_email = 'Enter a valid email address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setFailure(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body = {
        vessel_imo: f.vessel_imo.trim(),
        vessel_name: f.vessel_name.trim(),
        flag_state: f.flag_state.trim() || undefined,
        vessel_type: f.vessel_type,
        gross_tonnage: f.gross_tonnage ? Number(f.gross_tonnage) : undefined,
        port: f.port,
        berth: f.berth.trim() || undefined,
        preferred_date: f.preferred_date || undefined,
        preferred_time_window: f.preferred_time_window || undefined,
        agent_name: f.agent_name.trim(),
        agent_email: f.agent_email.trim() || undefined,
        agent_phone: f.agent_phone.trim() || undefined,
        has_waste_to_land: f.has_waste_to_land,
        channel: 'PORTAL',
      };
      setReceipt(await api.lodgeRequest(body));
    } catch (err) {
      setFailure(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="wrap page">
        <h1>Request lodged</h1>
        <p className="lede">
          A compliance officer will review this request and schedule an attendance.
          Keep the reference below; it is how you track the request.
        </p>
        <div className="receipt">
          <div style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.06em', color: '#4A5B63', fontWeight: 600 }}>
            Your reference
          </div>
          <div className="ref">{receipt.request_reference}</div>
          <span className="status submitted">{receipt.status}</span>
          <dl className="kv">
            <dt>Vessel</dt><dd>{f.vessel_name} &middot; IMO {f.vessel_imo}</dd>
            <dt>Port</dt><dd>{f.port}</dd>
            <dt>Lodged</dt><dd>{new Date(receipt.submitted_at).toLocaleString()}</dd>
            <dt>Waste to land</dt><dd>{f.has_waste_to_land ? 'Yes' : 'No'}</dd>
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
      <h1>Request a MARPOL inspection</h1>
      <p className="lede">
        Lodge this before arrival where you can. The vessel type you give determines
        which Annexes an officer will inspect against, so choose it carefully.
      </p>

      {failure && <div className="notice bad" role="alert" style={{ marginBottom: 18 }}>{failure}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <fieldset className="fieldset">
          <legend>Vessel</legend>
          <div className="fields">
            <Field id="vessel_imo" label="IMO number" hint="Seven digits, as shown on the hull" error={errors.vessel_imo}>
              <Text id="vessel_imo" mono inputMode="numeric" maxLength={7}
                value={f.vessel_imo} onChange={set('vessel_imo')} placeholder="9123456" />
            </Field>
            <Field id="vessel_name" label="Vessel name" error={errors.vessel_name}>
              <Text id="vessel_name" value={f.vessel_name} onChange={set('vessel_name')} />
            </Field>
            <Field id="vessel_type" label="Vessel type" error={errors.vessel_type}
              hint="Determines which Annexes apply">
              <Select id="vessel_type" value={f.vessel_type} onChange={set('vessel_type')}
                options={TYPES.map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field id="flag_state" label="Flag state">
              <Text id="flag_state" value={f.flag_state} onChange={set('flag_state')} placeholder="Nigeria" />
            </Field>
            <Field id="gross_tonnage" label="Gross tonnage">
              <Text id="gross_tonnage" mono inputMode="numeric" value={f.gross_tonnage} onChange={set('gross_tonnage')} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Port call</legend>
          <div className="fields">
            <Field id="port" label="Port">
              <Select id="port" value={f.port} onChange={set('port')}
                options={PORTS.map(p => ({ value: p, label: p }))} />
            </Field>
            <Field id="berth" label="Berth or anchorage">
              <Text id="berth" value={f.berth} onChange={set('berth')} />
            </Field>
            <Field id="preferred_date" label="Preferred date">
              <Text id="preferred_date" type="date" value={f.preferred_date} onChange={set('preferred_date')} />
            </Field>
            <Field id="preferred_time_window" label="Preferred time">
              <Select id="preferred_time_window" value={f.preferred_time_window} onChange={set('preferred_time_window')}
                options={[
                  { value: '', label: 'No preference' },
                  { value: 'MORNING', label: 'Morning' },
                  { value: 'AFTERNOON', label: 'Afternoon' },
                  { value: 'EVENING', label: 'Evening' },
                ]} />
            </Field>
            <div className="field span-2">
              <div className="check">
                <input id="has_waste_to_land" type="checkbox"
                  checked={f.has_waste_to_land} onChange={set('has_waste_to_land')} />
                <label htmlFor="has_waste_to_land">
                  This vessel has waste to land. The officer will raise a collection
                  note during the inspection.
                </label>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Who to contact</legend>
          <div className="fields">
            <Field id="agent_name" label="Agent or master" error={errors.agent_name}>
              <Text id="agent_name" value={f.agent_name} onChange={set('agent_name')} />
            </Field>
            <Field id="agent_email" label="Email" error={errors.agent_email}>
              <Text id="agent_email" type="email" value={f.agent_email} onChange={set('agent_email')} />
            </Field>
            <Field id="agent_phone" label="Telephone">
              <Text id="agent_phone" mono value={f.agent_phone} onChange={set('agent_phone')} />
            </Field>
          </div>
        </fieldset>

        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Lodging…' : 'Lodge request'}
          </button>
          <button className="btn ghost" type="button" onClick={() => go('/')}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
