import React, { useEffect, useState } from 'react';
import { getInspection, patchInspection } from '../db.js';

/**
 * WASTE DECLARED FOR LANDING  (FR-32)
 *
 * Captured between completing the checklist and signing, because the Master
 * attests it along with everything else. This screen produces the FIRST of
 * the four quantities the custody chain compares. Without it reconciliation
 * has nothing to reconcile against, which is why it sits inside the signed
 * record rather than being collected later by the waste team.
 */
const STREAMS = [
  ['I',   'Oily water, sludge, slops', 'CBM'],
  ['II',  'Noxious liquid residues',   'CBM'],
  ['III', 'Harmful substances',        'SACKS'],
  ['IV',  'Sewage',                    'CBM'],
  ['V',   'Garbage',                   'CBM'],
  ['VI',  'ODS and exhaust residues',  'CBM'],
];
const UNITS = ['CBM', 'L', 'TONNES', 'SACKS'];

export default function Declarations({ localId, go }) {
  const [insp, setInsp] = useState(null);
  const [rows, setRows] = useState({});

  useEffect(() => {
    getInspection(localId).then(r => {
      setInsp(r);
      const seed = {};
      STREAMS.forEach(([annex, , unit]) => {
        const existing = (r.declarations || []).find(d => d.annex_code === annex);
        seed[annex] = existing || {
          annex_code: annex, waste_type: '', to_be_landed: false,
          declared_quantity: '', quantity_unit: unit,
          held_onboard_quantity: '', date_last_discharged: '',
        };
      });
      setRows(seed);
    });
  }, [localId]);

  const set = (annex, patch) => setRows(r => ({ ...r, [annex]: { ...r[annex], ...patch } }));

  async function next() {
    const declarations = Object.values(rows)
      .filter(d => d.to_be_landed || d.held_onboard_quantity !== '')
      .map(d => ({
        annex_code: d.annex_code,
        waste_type: d.waste_type || null,
        to_be_landed: !!d.to_be_landed,
        declared_quantity: d.declared_quantity === '' ? null : Number(d.declared_quantity),
        quantity_unit: d.quantity_unit || null,
        held_onboard_quantity: d.held_onboard_quantity === '' ? null : Number(d.held_onboard_quantity),
        date_last_discharged: d.date_last_discharged || null,
      }));
    await patchInspection(localId, { declarations });
    go(`/sign/${localId}`);
  }

  if (!insp) return <div className="wrap center">Loading…</div>;
  const landing = Object.values(rows).filter(d => d.to_be_landed);

  return (
    <div className="wrap page">
      <h1>Waste declared for landing</h1>
      <p className="lede">
        Record what the vessel is landing and what it is retaining. The quantity
        you enter here is the figure against which the collected and received
        quantities are later compared.
      </p>

      {STREAMS.map(([annex, label, defUnit]) => {
        const d = rows[annex] || {};
        return (
          <div className={`item ${d.to_be_landed ? 'conforming' : ''}`} key={annex}>
            <div className="code">ANNEX {annex}</div>
            <div className="req">{label}</div>

            <div className="tri" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" className="yes" aria-pressed={d.to_be_landed === true}
                onClick={() => set(annex, { to_be_landed: true })}>To be landed</button>
              <button type="button" className="na" aria-pressed={d.to_be_landed === false}
                onClick={() => set(annex, { to_be_landed: false, declared_quantity: '' })}>None</button>
            </div>

            {d.to_be_landed && (
              <div className="sub">
                <div className="grid2">
                  <div>
                    <label htmlFor={`q-${annex}`}>Quantity to land</label>
                    <input id={`q-${annex}`} className="mono" inputMode="decimal"
                      value={d.declared_quantity} onChange={e => set(annex, { declared_quantity: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`u-${annex}`}>Unit</label>
                    <select id={`u-${annex}`} value={d.quantity_unit || defUnit}
                      onChange={e => set(annex, { quantity_unit: e.target.value })}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`t-${annex}`}>Type or description</label>
                    <input id={`t-${annex}`} value={d.waste_type}
                      onChange={e => set(annex, { waste_type: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`h-${annex}`}>Retained on board</label>
                    <input id={`h-${annex}`} className="mono" inputMode="decimal"
                      value={d.held_onboard_quantity}
                      onChange={e => set(annex, { held_onboard_quantity: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`dl-${annex}`}>Date last discharged</label>
                    <input id={`dl-${annex}`} type="date" value={d.date_last_discharged || ''}
                      onChange={e => set(annex, { date_last_discharged: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="dock">
        <div className="dock-in">
          <div className="stat">
            <b>{landing.length}</b> stream{landing.length === 1 ? '' : 's'} to land
            {landing.length > 0 && ' · a collection note will be raised'}
          </div>
          <button className="btn" onClick={next}>Continue to signing</button>
        </div>
      </div>
    </div>
  );
}
