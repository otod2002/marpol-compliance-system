import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Item from '../components/Item.jsx';
import { isApplicable, scoreInspection } from '@shared/rules.mjs';
import {
  getInspection, setResponse, setCertificate, patchInspection,
  addEvidence, evidenceFor, deleteEvidence, enqueue, storageEstimate,
} from '../db.js';

/**
 * The inspection screen.
 *
 * Every interaction here terminates at the device local store. No request
 * crosses to the server between boarding and the release of the queue, which
 * is the property TO-04 verifies and the design's whole answer to working
 * aboard a vessel.
 *
 * Applicability and scoring run on the cached rule set, through the SAME
 * module the server runs on synchronisation, so the officer's feedback and
 * the determination of record cannot drift.
 */
export default function Inspection({ localId, pack, go }) {
  const [insp, setInsp] = useState(null);
  const [annex, setAnnex] = useState(null);
  const [evidence, setEvidence] = useState({});
  const [storage, setStorage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showOutstanding, setShowOutstanding] = useState(false);

  const reload = useCallback(async () => {
    const rec = await getInspection(localId);
    setInsp(rec);
    return rec;
  }, [localId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { storageEstimate().then(setStorage); }, [insp?.updated_at]);

  const sections = pack?.sections || [];
  useEffect(() => { if (!annex && sections.length) setAnnex(sections[0].section_id); }, [sections, annex]);

  const itemsBySection = useMemo(() => {
    const m = new Map();
    (pack?.items || []).forEach(i => {
      if (!m.has(i.section_id)) m.set(i.section_id, []);
      m.get(i.section_id).push(i);
    });
    return m;
  }, [pack]);

  const optionsByItem = useMemo(() => {
    const m = new Map();
    (pack?.options || []).forEach(o => {
      if (!m.has(o.item_id)) m.set(o.item_id, []);
      m.get(o.item_id).push(o);
    });
    return m;
  }, [pack]);

  const vessel = insp?.vessel || {};

  /* Live evaluation, on the cached rules. */
  const evaluation = useMemo(() => {
    if (!insp || !pack) return null;
    const responses = new Map(Object.entries(insp.responses || {}).map(([k, v]) => [k, v]));
    const actionCodes = new Map((pack.vocabularies?.action_codes || []).map(a => [a.action_id, a]));
    return scoreInspection(pack.items || [], responses, vessel, { actionCodes });
  }, [insp, pack, vessel]);

  const respond = async (item_id, patch) => setInsp(await setResponse(localId, item_id, patch));
  const certificate = async (item, patch) => setInsp(await setCertificate(localId, certTypeFor(item), patch));

  const loadEvidence = useCallback(async item_id => {
    const list = await evidenceFor(localId, item_id);
    setEvidence(e => ({ ...e, [item_id]: list }));
  }, [localId]);

  useEffect(() => {
    const items = itemsBySection.get(annex) || [];
    items.forEach(i => loadEvidence(i.item_id));
  }, [annex, itemsBySection, loadEvidence]);

  const onAddEvidence = async (item_id, file) => {
    try { await addEvidence(localId, item_id, file); await loadEvidence(item_id); }
    catch (e) { setNotice({ bad: true, text: e.message }); }
  };
  const onRemoveEvidence = async (id) => {
    await deleteEvidence(id);
    const items = itemsBySection.get(annex) || [];
    items.forEach(i => loadEvidence(i.item_id));
  };

  /** Sections still holding an unanswered applicable item, so the officer can
   *  jump straight to what is outstanding rather than hunt for it. */
  const outstanding = useMemo(() => {
    if (!insp || !pack) return [];
    return sections.map(s => {
      const secItems = (itemsBySection.get(s.section_id) || [])
        .filter(i => isApplicable(i.applicability_rule, vessel));
      const missing = secItems.filter(i => {
        const st = insp.responses[i.item_id]?.response_state;
        return !st || st === 'UNANSWERED';
      }).length;
      return { section: s, missing };
    }).filter(x => x.missing > 0);
  }, [insp, pack, sections, itemsBySection, vessel]);

  const unanswered = outstanding.reduce((a, o) => a + o.missing, 0);

  function complete() {
    if (unanswered > 0) { setShowOutstanding(true); return; }
    go(`/declare/${localId}`);
  }

  if (!insp || !pack) return <div className="wrap center">Loading inspection…</div>;

  const items = itemsBySection.get(annex) || [];
  const section = sections.find(s => s.section_id === annex);

  return (
    <div className="wrap page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h1>{vessel.vessel_name || 'Inspection'}</h1>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          IMO {vessel.imo_number || '—'}
        </span>
      </div>
      <p className="lede">
        {insp.case_reference} &middot; {vessel.vessel_type || 'Unknown type'} &middot; captured on this device
      </p>

      {notice && (
        <div className={`notice ${notice.bad ? 'bad' : 'good'}`} role="alert">{notice.text}</div>
      )}
      {storage && storage.pct !== null && storage.pct > 80 && (
        <div className="notice">
          Device storage is {storage.pct}% used. Synchronise soon to free space for evidence.
        </div>
      )}

      <nav className="annexnav" aria-label="Inspection sections">
        {sections.map(s => {
          const secItems = (itemsBySection.get(s.section_id) || []).filter(i => isApplicable(i.applicability_rule, vessel));
          const answered = secItems.filter(i => {
            const st = insp.responses[i.item_id]?.response_state;
            return st && st !== 'UNANSWERED';
          }).length;
          const flagged = secItems.some(i => insp.responses[i.item_id]?.response_state === 'NON_CONFORMING');
          const done = secItems.length > 0 && answered === secItems.length;
          return (
            <button key={s.section_id} type="button"
              className={`${annex === s.section_id ? 'active ' : ''}${flagged ? 'flagged' : done ? 'done' : ''}`}
              onClick={() => setAnnex(s.section_id)}>
              {s.annex_code ? `Annex ${s.annex_code}` : s.section_title}
              <span className="cnt">{answered}/{secItems.length}</span>
            </button>
          );
        })}
      </nav>

      <h2>{section?.section_title}</h2>

      {items.map(item => (
        <Item
          key={item.item_id}
          item={{ ...item, annex_code: section?.annex_code }}
          applicable={isApplicable(item.applicability_rule, vessel)}
          response={insp.responses[item.item_id]}
          certificate={insp.certificates[certTypeFor(item)]}
          evidence={evidence[item.item_id]}
          options={optionsByItem.get(item.item_id) || []}
          deficiencyCodes={pack.vocabularies?.deficiency_codes || []}
          actionCodes={pack.vocabularies?.action_codes || []}
          inspectionDate={insp.inspection_date}
          onRespond={respond}
          onCertificate={certificate}
          onAddEvidence={onAddEvidence}
          onRemoveEvidence={onRemoveEvidence}
        />
      ))}

      {showOutstanding && (
        <div className="sheet" role="dialog" aria-label="Items still outstanding">
          <div className="sheet-in">
            <h2 style={{ margin: '0 0 6px' }}>Not ready to sign</h2>
            <p style={{ margin: '0 0 12px', color: 'var(--ink-2)' }}>
              {unanswered} applicable item{unanswered === 1 ? '' : 's'} still unanswered.
              Every applicable item must carry a response before the Master signs.
            </p>
            {outstanding.map(o => (
              <button key={o.section.section_id} className="row-btn"
                onClick={() => { setAnnex(o.section.section_id); setShowOutstanding(false); window.scrollTo(0, 0); }}>
                <span>{o.section.section_title}</span>
                <span className="mono">{o.missing} left</span>
              </button>
            ))}
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setShowOutstanding(false)}>Keep working</button>
            </div>
          </div>
        </div>
      )}

      <div className="dock">
        <div className="dock-in">
          <div className="stat">
            <b>{evaluation?.answeredCount ?? 0}</b>/{evaluation?.applicableCount ?? 0} answered
            {' · '}<b>{evaluation?.deficiencies.length ?? 0}</b> deficienc{evaluation?.deficiencies.length === 1 ? 'y' : 'ies'}
            {evaluation?.score !== null && evaluation?.score !== undefined && <> {' · '}<b>{evaluation.score}%</b></>}
            {evaluation?.state === 'DETAINABLE' && <> {' · '}<b style={{ color: 'var(--buoy)' }}>DETAINABLE</b></>}
          </div>
          <button className="btn" onClick={complete}>
            {unanswered > 0 ? `Sign off (${unanswered} left)` : 'Sign off'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Derive the certificate type from the item requirement text. */
function certTypeFor(item) {
  const t = (item.requirement_text || '').toUpperCase();
  if (t.includes('IOPP')) return 'IOPP';
  if (t.includes('NLS') || t.includes('FITNESS')) return 'NLS';
  if (t.includes('ISPP')) return 'ISPP';
  if (t.includes('IAPP')) return 'IAPP';
  return item.item_code;
}
