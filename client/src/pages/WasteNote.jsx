import React, { useEffect, useState } from 'react';
import { get, post } from '../api.js';
import { reconcileCustody } from '@shared/rules.mjs';

/**
 * THE WASTE CUSTODY CHAIN  (FR-34, FR-40, FR-41, FR-42)
 *
 * One note, four stages, three different people, over an interval of days.
 * The screen is STAGE-SCOPED: each party is shown only the stage it may
 * attest, because a collection team leader who could record a receipt at the
 * facility would break the chain the reconciliation depends on.
 *
 * The server enforces the same scoping, and the schema enforces single
 * attestation independently of both. Three layers, deliberately.
 */
const STAGES = [
  ['BOOKED',     'Booked',      'Section A', 'Collection arranged during the inspection.'],
  ['COLLECTED',  'Collected',   'Section B/C', 'Taken from the vessel. Team leader attests.'],
  ['IN_TRANSIT', 'In transit',  'Section C', 'Conveyed by barge or boat.'],
  ['RECEIVED',   'Received',    'Section D', 'Delivered ashore. Facility receiver attests.'],
];

const ROLE_STAGE = {
  COMPLIANCE_OFFICER: 'BOOKED', SUPERVISOR: 'BOOKED',
  WASTE_TEAM_LEADER: 'COLLECTED', FACILITY_RECEIVER: 'RECEIVED',
};

export default function WasteNote({ wcnId, me, go }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ quantity: '', quantity_unit: 'CBM', location: '', means_of_conveyance: '', signatory_name: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Fixed here: get() throws on a non-2xx response and returns the parsed
  // body directly on success — it does not return a { ok, body } shape.
  // Same contract mismatch already fixed in Admin.jsx; see that file's
  // comment for why.
  const load = async () => {
    try {
      setData(await get(`/waste-notes/${wcnId}`));
    } catch (e) {
      setMsg({ bad: true, text: e.message });
    }
  };
  useEffect(() => { load(); }, [wcnId]);

  if (!data) return <div className="wrap center">{msg ? msg.text : 'Loading consignment…'}</div>;

  const { note, custody_events: events, reconciliation } = data;
  const recorded = new Set(events.map(e => e.stage));
  const myStage = ROLE_STAGE[me.role];
  const canAttest = myStage && !recorded.has(myStage) && stagePermitted(myStage, recorded);

  /* Preview the variance before it is committed, so the person recording the
     final quantity sees at once whether it will fall outside tolerance. */
  const preview = myStage === 'RECEIVED' && form.quantity !== ''
    ? reconcileCustody(
        note.declaration_id ? { declared_quantity: note.declared_quantity, quantity_unit: note.declared_quantity_unit } : null,
        note,
        [...events, { stage: 'RECEIVED', quantity: Number(form.quantity), quantity_unit: form.quantity_unit }])
    : null;

  async function attest() {
    setMsg(null); setBusy(true);
    const r = await post(`/waste-notes/${wcnId}/custody`, {
      stage: myStage,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      quantity_unit: form.quantity_unit,
      location: form.location || null,
      means_of_conveyance: form.means_of_conveyance || null,
      signatory_name: form.signatory_name || me.full_name,
      waste_type: note.general_description || null,
    });
    setBusy(false);
    if (r.status === 201) { setMsg({ text: `${myStage} recorded.` }); load(); }
    else setMsg({ bad: true, text: r.body.error || 'Could not record the stage.' });
  }

  return (
    <div className="wrap page">
      <h1>Consignment {note.wcn_number}</h1>
      <p className="lede">
        {note.general_description || 'Ship-generated waste'} · {note.containment_type || 'containment not stated'}
        {note.booked_date ? ` · booked ${note.booked_date}` : ''}
      </p>

      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <h2>Chain of custody</h2>
      <div className="panel">
        {STAGES.map(([code, name, section, note2]) => {
          const ev = events.find(e => e.stage === code);
          const done = !!ev;
          return (
            <div className="row" key={code}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span aria-hidden="true" style={{
                  width: 13, height: 13, borderRadius: '50%', marginTop: 6, flex: 'none',
                  border: `1.5px solid ${done ? 'var(--flag)' : 'var(--line)'}`,
                  background: done ? 'var(--flag)' : 'transparent',
                }} />
                <div>
                  <strong style={{ color: done ? 'var(--ink)' : 'var(--ink-2)' }}>{name}</strong>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', marginLeft: 8 }}>{section}</span>
                  <div className="ref">
                    {done
                      ? `${ev.quantity ?? '—'} ${ev.quantity_unit || ''} · ${new Date(ev.occurred_at).toLocaleString()}`
                      : note2}
                  </div>
                </div>
              </div>
              {code === myStage && !done && <span className="badge soon">Yours to record</span>}
            </div>
          );
        })}
      </div>

      {canAttest && (
        <>
          <h2>Record {STAGES.find(s => s[0] === myStage)[1].toLowerCase()}</h2>
          <div className="panel">
            <div className="grid2">
              <div>
                <label htmlFor="q">Quantity</label>
                <input id="q" className="mono" inputMode="decimal" value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <label htmlFor="u">Unit</label>
                <select id="u" value={form.quantity_unit}
                  onChange={e => setForm({ ...form, quantity_unit: e.target.value })}>
                  {['CBM', 'L', 'TONNES', 'SACKS'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="loc">{myStage === 'RECEIVED' ? 'Receiving facility' : 'Vessel location'}</label>
                <input id="loc" value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              {myStage !== 'RECEIVED' && (
                <div>
                  <label htmlFor="mc">Means of conveyance</label>
                  <select id="mc" value={form.means_of_conveyance}
                    onChange={e => setForm({ ...form, means_of_conveyance: e.target.value })}>
                    <option value="">Select</option>
                    <option value="BARGE">Barge</option>
                    <option value="BOAT">Boat</option>
                    <option value="ROAD_TANKER">Road tanker</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="sg">Attesting name</label>
                <input id="sg" value={form.signatory_name}
                  placeholder={me.full_name}
                  onChange={e => setForm({ ...form, signatory_name: e.target.value })} />
              </div>
            </div>

            {preview && preview.variance_flag && preview.variance_flag !== 'INCOMPLETE' && (
              <div className={`notice ${preview.variance_flag === 'WITHIN_TOLERANCE' ? 'good' : 'bad'}`}
                style={{ marginTop: 14 }}>
                {preview.variance_flag === 'UNIT_MISMATCH'
                  ? 'These units cannot be compared without a density the system does not hold. The variance will be raised as a unit mismatch rather than estimated.'
                  : <>Declared <span className="mono">{preview.declared_quantity}</span>,
                     receiving <span className="mono">{preview.received_quantity}</span>{' '}
                     — variance <span className="mono">{preview.variance_percent}%</span>,{' '}
                     <strong>{preview.variance_flag === 'BEYOND_TOLERANCE' ? 'beyond tolerance' : 'within tolerance'}</strong>.</>}
              </div>
            )}

            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn" onClick={attest} disabled={busy}>
                {busy ? 'Recording…' : `Attest ${STAGES.find(s => s[0] === myStage)[1].toLowerCase()}`}
              </button>
            </div>
          </div>
        </>
      )}

      {myStage && recorded.has(myStage) && (
        <div className="notice">
          You have already attested this stage. A stage may be attested once only,
          and the record cannot be amended from here.
        </div>
      )}
      {myStage && !recorded.has(myStage) && !canAttest && (
        <div className="notice">
          Waiting on an earlier stage. A stage cannot be recorded before its
          predecessor, or the reconciliation would be meaningless.
        </div>
      )}

      {reconciliation && (
        <>
          <h2>Reconciliation</h2>
          <div className={`receipt-doc`} style={{ borderLeft: `4px solid ${
            reconciliation.variance_flag === 'WITHIN_TOLERANCE' ? 'var(--flag)' : 'var(--danger)'}` }}>
            <dl className="kv2">
              <dt>Declared</dt><dd>{reconciliation.declared_quantity ?? '—'}</dd>
              <dt>Booked</dt><dd>{reconciliation.booked_quantity ?? '—'}</dd>
              <dt>Collected</dt><dd>{reconciliation.collected_quantity ?? '—'}</dd>
              <dt>Received</dt><dd>{reconciliation.received_quantity ?? '—'}</dd>
              <dt>Variance</dt><dd>{reconciliation.variance_value ?? '—'}{reconciliation.variance_percent != null ? ` (${reconciliation.variance_percent}%)` : ''}</dd>
              <dt>Outcome</dt><dd>{reconciliation.variance_flag}</dd>
            </dl>
            {reconciliation.variance_flag === 'BEYOND_TOLERANCE' && (
              <div className="notice bad" style={{ marginTop: 12 }}>
                Raised for supervisory review. What the vessel declared and what the
                facility received differ by more than the configured tolerance.
              </div>
            )}
          </div>
        </>
      )}

      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn ghost" onClick={() => go('/queue')}>Back to queue</button>
      </div>
    </div>
  );
}

function stagePermitted(stage, recorded) {
  const order = ['BOOKED', 'COLLECTED', 'IN_TRANSIT', 'RECEIVED'];
  const i = order.indexOf(stage);
  if (i <= 0) return true;
  const predecessor = order[i - 1];
  if (predecessor === 'IN_TRANSIT') return recorded.has('COLLECTED');
  return recorded.has(predecessor);
}
