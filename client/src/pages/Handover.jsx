import React, { useEffect, useMemo, useState } from 'react';
import Qr from '../components/Qr.jsx';
import { getInspection, loadPack } from '../db.js';

const PORTAL = import.meta.env.VITE_PORTAL_URL || 'http://localhost:5173';
const trackUrl = ref => `${PORTAL}/#/track?ref=${encodeURIComponent(ref || '')}`;

const ANNEX_NAME = {
  I: 'Oily water, sludge and slops', II: 'Noxious liquid residues',
  III: 'Harmful substances', IV: 'Sewage', V: 'Garbage',
  VI: 'Ozone-depleting substances and exhaust residues',
};
const CONTAINMENT = {
  LIQUID: 'Liquid, in tank', DRUM: 'Drums', REFUSE_SACKS: 'Refuse sacks',
  BULK: 'Bulk', DRY: 'Dry', OTHER: 'Other',
};
const MEANS = { BARGE: 'Barge', BOAT: 'Boat', ROAD_TANKER: 'Road tanker', OTHER: 'Other' };

/**
 * HANDOVER
 *
 * The Master leaves with TWO documents, which is the standard the paper
 * process observes: the inspection report and the waste collection note.
 * They are separate because they record separate things and are signed by
 * different parties at different times, and combining them would misrepresent
 * both.
 *
 * Both are provisional, and both say so on their face. The MCI number and the
 * collection note number are allocated by a server sequence; two devices
 * working offline cannot both allocate one without colliding, so neither
 * number can be issued at the vessel. Each document carries a QR code linking
 * to the tracking page, so the Master can retrieve the definitive version
 * once it has been approved without anyone emailing anything.
 */
export default function Handover({ localId, go }) {
  const [insp, setInsp] = useState(null);
  useEffect(() => { getInspection(localId).then(setInsp); }, [localId]);

  const landing = useMemo(
    () => (insp?.declarations || []).filter(d => d.to_be_landed),
    [insp]);

  if (!insp) return <div className="wrap center">Loading…</div>;

  return (
    <div className="wrap page">
      <h1>Documents for the Master</h1>
      <p className="lede">
        {insp.vessel?.vessel_name} · IMO {insp.vessel?.imo_number}. Two documents
        are handed over before you leave the vessel. Print or save each; both work
        with no connection.
      </p>

      <div className="notice">
        Both are provisional. The MCI number and the collection note number are
        allocated when the record reaches the Agency, and the definitive documents
        follow supervisory approval. Each carries a code the Master can scan to
        retrieve them.
      </div>

      <div className="panel">
        <div className="row">
          <div>
            <strong>1 &nbsp; Vessel MARPOL Compliance Inspection Report</strong>
            <div className="ref">
              Findings, deficiencies, certificates, and both signatures
            </div>
          </div>
          <button className="btn" style={{ minHeight: 42, fontSize: 15 }}
            onClick={() => go(`/receipt/${localId}`)}>Open</button>
        </div>

        <div className="row">
          <div>
            <strong>2 &nbsp; Controlled Waste Collection Note</strong>
            <div className="ref">
              {landing.length === 0
                ? 'No waste declared for landing — no note is issued'
                : `Section A booking for ${landing.length} waste stream${landing.length === 1 ? '' : 's'}`}
            </div>
          </div>
          {landing.length > 0
            ? <button className="btn" style={{ minHeight: 42, fontSize: 15 }}
                onClick={() => go(`/wastenote-receipt/${localId}`)}>Open</button>
            : <span className="badge grey">Not applicable</span>}
        </div>
      </div>

      {landing.length === 0 && (
        <div className="notice">
          The vessel declared nothing for landing, so only the inspection report is
          handed over. A collection note is raised only where waste is to be landed.
        </div>
      )}

      <div className="actions">
        <button className="btn ghost" onClick={() => go('/queue')}>Back to queue</button>
      </div>
    </div>
  );
}

/* ==================================================================== */

/**
 * PROVISIONAL CONTROLLED WASTE COLLECTION NOTE
 *
 * Section A only. Sections B, C and D are attested later by the collection
 * team and the receiving facility, so they are shown here as the stages that
 * remain rather than left blank without explanation — a Master handed a form
 * with three empty sections is entitled to know why.
 */
export function WasteNoteReceipt({ localId, go }) {
  const [insp, setInsp] = useState(null);
  useEffect(() => { getInspection(localId).then(setInsp); }, [localId]);
  if (!insp) return <div className="wrap center">Preparing note…</div>;

  const v = insp.vessel || {};
  const landing = (insp.declarations || []).filter(d => d.to_be_landed);
  const officer = (insp.signatories || []).find(s => s.signatory_role !== 'MASTER_OR_CHIEF_OFFICER');
  const master = (insp.signatories || []).find(s => s.signatory_role === 'MASTER_OR_CHIEF_OFFICER');

  return (
    <div className="wrap page">
      <h1>Waste collection note</h1>
      <p className="lede">Document 2 of 2. Hand this to the Master with the inspection report.</p>

      <div className="receipt-doc">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 21, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Controlled Waste Collection and Transfer Note
            </div>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              NIMASA Offshore Waste Reception Facility &middot; Marine Environment Management Department
            </div>
          </div>
          <span className="stamp">Provisional</span>
        </div>

        <div className="notice" style={{ marginTop: 16 }}>
          No collection note number has been allocated. The Agency allocates it when
          this record is received. Sections B, C and D are completed at collection
          and at delivery ashore.
        </div>

        <h3>Originator of the waste</h3>
        <dl className="kv2">
          <dt>Vessel</dt><dd>{v.vessel_name || '—'}</dd>
          <dt>IMO</dt><dd>{v.imo_number || '—'}</dd>
          <dt>Type</dt><dd>{v.vessel_type || '—'}</dd>
          <dt>Case</dt><dd>{insp.case_reference || '—'}</dd>
          <dt>Inspection date</dt><dd>{insp.inspection_date}</dd>
          <dt>Master</dt><dd>{insp.master_name || master?.name || '—'}</dd>
          <dt>Refer to MCI</dt><dd>provisional — device record {insp.local_id}</dd>
        </dl>

        <h3>Section A &mdash; description of waste and booking</h3>
        <div className="deflist">
          {landing.map(d => (
            <div className="d" key={d.annex_code}>
              <strong>Annex {d.annex_code}</strong> &mdash; {ANNEX_NAME[d.annex_code] || d.waste_type}
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3 }}>
                quantity {d.declared_quantity ?? '—'} {d.quantity_unit || ''}
                {d.containment_type ? ` · contained as ${CONTAINMENT[d.containment_type] || d.containment_type}` : ''}
                {d.held_onboard_quantity != null ? ` · ${d.held_onboard_quantity} ${d.quantity_unit || ''} retained on board` : ''}
              </div>
              <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                collection booked {d.booked_date || 'date not set'} {d.booked_time || ''}
                {d.booked_means ? ` by ${MEANS[d.booked_means] || d.booked_means}` : ''}
              </div>
              {d.waste_type && <div style={{ fontSize: 14, marginTop: 3 }}>{d.waste_type}</div>}
            </div>
          ))}
        </div>

        <h3>Sections B, C and D &mdash; to be completed</h3>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 14.5, color: 'var(--ink-2)' }}>
          <li style={{ marginBottom: 4 }}>
            <strong>Section B</strong> — collection from the vessel. The Master signs and
            stamps for the quantity actually taken.
          </li>
          <li style={{ marginBottom: 4 }}>
            <strong>Section C</strong> — the collection team leader confirms receipt and
            the means of conveyance.
          </li>
          <li>
            <strong>Section D</strong> — the reception facility records the quantity
            received ashore and signs for it.
          </li>
        </ol>
        <div className="notice" style={{ marginTop: 12 }}>
          The quantity declared above is compared automatically against the quantity
          collected and the quantity received. A material difference is raised for
          review.
        </div>

        <h3>Booked by</h3>
        <div className="grid2">
          <div className="sigbox">
            {officer?.signature_path && <img src={officer.signature_path} alt="" />}
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6, fontSize: 13.5 }}>
              <strong>{officer?.name || '—'}</strong>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                MARPOL compliance inspector
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Qr value={trackUrl(insp.case_reference)}
              caption="Scan to follow this consignment and retrieve the completed note" />
          </div>
        </div>

        <p className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 18 }}>
          Provisional note generated on the inspecting device at{' '}
          {new Date(insp.updated_at).toLocaleString()}. This note records an intended
          custody transfer; it does not certify the vessel or the facility and carries
          no regulatory force.
        </p>
      </div>

      <div className="actions" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => window.print()}>Print or save as PDF</button>
        <button className="btn ghost" onClick={() => go(`/handover/${localId}`)}>Both documents</button>
      </div>
    </div>
  );
}
