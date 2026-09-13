import React, { useEffect, useState } from 'react';
import { getInspection, patchInspection } from '../db.js';

/** FR-18 : cargo particulars. Captured before the checklist because cargo
 *  type bears on which Annexes matter — a vessel carrying noxious liquids in
 *  bulk is inspected differently from one carrying containers. */
const TYPES = [
  ['GENERAL_CARGO', 'General cargo'], ['CONTAINER', 'Container'], ['REEFER', 'Reefer'],
  ['DRY_BULK', 'Dry bulk'], ['BULK_LIQUID', 'Bulk liquid'], ['VEHICLES', 'Vehicles'],
  ['BALLAST', 'In ballast'], ['OTHER', 'Other'],
];

export default function Cargo({ localId, go }) {
  const [insp, setInsp] = useState(null);
  const [c, setC] = useState({
    cargo_type: '', container_20_units: '', container_40_units: '', vehicle_units: '',
    other_description: '', quantity: '', quantity_unit: 'MT', out_cargo: '',
  });

  useEffect(() => {
    getInspection(localId).then(r => { setInsp(r); if (r?.cargo) setC({ ...c, ...r.cargo }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  const set = k => e => setC({ ...c, [k]: e.target.value });
  const num = v => (v === '' ? null : Number(v));

  async function next() {
    await patchInspection(localId, {
      cargo: {
        cargo_type: c.cargo_type || null,
        container_20_units: num(c.container_20_units),
        container_40_units: num(c.container_40_units),
        vehicle_units: num(c.vehicle_units),
        other_description: c.other_description || null,
        quantity: num(c.quantity),
        quantity_unit: c.quantity_unit || null,
        out_cargo: c.out_cargo || null,
      },
    });
    // Fixed here: the original said go(`/inspect/${localId}`), but the
    // real route (App.jsx) is /inspection/:localId — one letter off, and
    // it would have dead-ended into the Placeholder screen every time.
    go(`/inspection/${localId}`);
  }

  if (!insp) return <div className="wrap center">Loading…</div>;
  const containers = ['CONTAINER', 'REEFER'].includes(c.cargo_type);

  return (
    <div className="wrap page">
      <h1>Cargo particulars</h1>
      <p className="lede">
        {insp.vessel?.vessel_name} · IMO {insp.vessel?.imo_number}. What the vessel
        is carrying bears on which Annexes matter during the inspection.
      </p>

      <div className="panel">
        <label htmlFor="ct">Cargo type</label>
        <select id="ct" value={c.cargo_type} onChange={set('cargo_type')}>
          <option value="">Select</option>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {containers && (
          <div className="grid2" style={{ marginTop: 14 }}>
            <div>
              <label htmlFor="c20">Containers, 20 ft</label>
              <input id="c20" className="mono" inputMode="numeric"
                value={c.container_20_units} onChange={set('container_20_units')} />
            </div>
            <div>
              <label htmlFor="c40">Containers, 40 ft</label>
              <input id="c40" className="mono" inputMode="numeric"
                value={c.container_40_units} onChange={set('container_40_units')} />
            </div>
          </div>
        )}

        {c.cargo_type === 'VEHICLES' && (
          <div style={{ marginTop: 14 }}>
            <label htmlFor="vu">Vehicles</label>
            <input id="vu" className="mono" inputMode="numeric"
              value={c.vehicle_units} onChange={set('vehicle_units')} />
          </div>
        )}

        <div className="grid2" style={{ marginTop: 14 }}>
          <div>
            <label htmlFor="qt">Quantity</label>
            <input id="qt" className="mono" inputMode="decimal" value={c.quantity} onChange={set('quantity')} />
          </div>
          <div>
            <label htmlFor="qu">Unit</label>
            <select id="qu" value={c.quantity_unit} onChange={set('quantity_unit')}>
              {['MT', 'TONNES', 'CBM', 'TEU', 'UNITS'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="span-2" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="od">Description</label>
            <input id="od" value={c.other_description} onChange={set('other_description')} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="oc">Out-cargo</label>
            <input id="oc" value={c.out_cargo} onChange={set('out_cargo')}
              placeholder="What is being loaded, if anything" />
          </div>
        </div>
      </div>

      <div className="actions">
        <button className="btn" onClick={next}>Continue to checklist</button>
        <button className="btn ghost" onClick={() => go('/queue')}>Back to queue</button>
      </div>
    </div>
  );
}
