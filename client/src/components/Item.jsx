import React, { useEffect, useState } from 'react';
import { evaluateCertificate } from '@shared/rules.mjs';

/**
 * Renders one checklist item, dispatching on the response type stored against
 * it. Adding an eighth type means extending this switch once, not editing
 * every item — which is why response_type lives on the row rather than in code.
 *
 * Inapplicable items are not rendered as disabled controls; they are rendered
 * as a short statement of why they do not apply. An officer should not have to
 * work out whether a greyed control is broken or simply irrelevant.
 */
export default function Item({
  item, applicable, response, certificate, evidence,
  onRespond, onCertificate, onAddEvidence, onRemoveEvidence,
  options, deficiencyCodes, actionCodes, inspectionDate,
}) {
  const state = response?.response_state;
  const cls = !applicable ? 'na'
    : state === 'CONFORMING' ? 'conforming'
    : state === 'NON_CONFORMING' ? 'nonconforming'
    : state === 'NOT_APPLICABLE' ? 'na' : '';

  if (!applicable) {
    return (
      <div className="item na">
        <div className="code">{item.item_code}</div>
        <div className="req">{item.requirement_text}</div>
        <div className="naflag">Not applicable to this vessel type &mdash; excluded from scoring</div>
      </div>
    );
  }

  return (
    <div className={`item ${cls}`}>
      <div className="code">{item.item_code}</div>
      <div className="req">{item.requirement_text}</div>
      {item.convention_reference && <div className="cite">{item.convention_reference}</div>}

      {item.response_type === 'TERNARY' && (
        <Ternary value={state} onChange={v => onRespond(item.item_id, { response_state: v })} />
      )}

      {item.response_type === 'CERTIFICATE' && (
        <Certificate
          item={item} cert={certificate} inspectionDate={inspectionDate}
          onChange={patch => onCertificate(item, patch)}
          onState={v => onRespond(item.item_id, { response_state: v })}
        />
      )}

      {item.response_type === 'DATE' && (
        <input type="date" value={response?.response_date || ''}
          onChange={e => onRespond(item.item_id, {
            response_date: e.target.value,
            response_state: e.target.value ? 'CONFORMING' : 'UNANSWERED',
          })} />
      )}

      {item.response_type === 'NUMERIC_UNIT' && (
        <div className="grid2">
          <input className="mono" inputMode="decimal" placeholder="0.00"
            value={response?.response_numeric ?? ''}
            onChange={e => onRespond(item.item_id, {
              response_numeric: e.target.value === '' ? null : Number(e.target.value),
              response_state: e.target.value === '' ? 'UNANSWERED' : 'CONFORMING',
            })} />
          <input value={item.unit || ''} readOnly aria-label="Unit" className="mono" />
        </div>
      )}

      {item.response_type === 'SINGLE_SELECT' && (
        <div className="chips">
          {options.map(o => (
            <button key={o.option_id} type="button" className="chip"
              aria-pressed={response?.selected_option_id === o.option_id}
              onClick={() => onRespond(item.item_id, {
                selected_option_id: o.option_id, response_state: 'CONFORMING',
              })}>{o.option_label}</button>
          ))}
        </div>
      )}

      {item.response_type === 'MULTI_SELECT' && (
        <MultiSelect options={options} value={response?.response_text}
          onChange={v => onRespond(item.item_id, {
            response_text: v, response_state: v ? 'CONFORMING' : 'UNANSWERED',
          })} />
      )}

      {item.response_type === 'FREE_TEXT' && (
        <textarea rows={3} value={response?.response_text || ''}
          onChange={e => onRespond(item.item_id, {
            response_text: e.target.value,
            response_state: e.target.value ? 'CONFORMING' : 'UNANSWERED',
          })} />
      )}

      {/* Classification appears only when something has been found. An officer
          is not asked to pick a deficiency code for a conforming item. */}
      {state === 'NON_CONFORMING' && (
        <div className="sub">
          <div className="grid2">
            <div>
              <label htmlFor={`d-${item.item_id}`}>Deficiency code</label>
              <select id={`d-${item.item_id}`} value={response?.deficiency_code_id || ''}
                onChange={e => onRespond(item.item_id, { deficiency_code_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Select a code</option>
                {deficiencyCodes
                  .filter(c => !item.annex_code || !c.annex_code || c.annex_code === item.annex_code)
                  .map(c => <option key={c.code_id} value={c.code_id}>{c.code} — {c.description}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`a-${item.item_id}`}>Action code</label>
              <select id={`a-${item.item_id}`} value={response?.action_code_id || ''}
                onChange={e => onRespond(item.item_id, { action_code_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Select an action</option>
                {actionCodes.map(a => (
                  <option key={a.action_id} value={a.action_id}>
                    {a.code} — {a.description}{a.is_detention ? ' (detainable)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label htmlFor={`r-${item.item_id}`}>Remark</label>
            <textarea id={`r-${item.item_id}`} rows={2} value={response?.remark || ''}
              onChange={e => onRespond(item.item_id, { remark: e.target.value })} />
          </div>
        </div>
      )}

      <Evidence
        itemId={item.item_id} evidence={evidence}
        onAdd={onAddEvidence} onRemove={onRemoveEvidence} />
    </div>
  );
}

function Ternary({ value, onChange }) {
  const opt = [['YES', 'CONFORMING', 'yes'], ['NO', 'NON_CONFORMING', 'no'], ['N/A', 'NOT_APPLICABLE', 'na']];
  return (
    <div className="tri" role="group">
      {opt.map(([label, v, cls]) => (
        <button key={v} type="button" className={cls} aria-pressed={value === v}
          onClick={() => onChange(value === v ? 'UNANSWERED' : v)}>{label}</button>
      ))}
    </div>
  );
}

/**
 * Certificate block. The validity state is computed the moment a date is
 * entered — an arithmetic comparison, not a reading. This is the mechanism
 * that removes one of the two error classes named in Section 1.2, and it is
 * the same function the server runs on synchronisation.
 */
function Certificate({ cert, inspectionDate, onChange, onState }) {
  const c = cert || {};
  const flag = evaluateCertificate(c, inspectionDate);
  const badge = { EXPIRED: 'expired', EXPIRING_SOON: 'soon', VALID: 'valid' }[flag] || 'grey';
  const wording = {
    EXPIRED: 'Expired', EXPIRING_SOON: 'Expires soon',
    VALID: 'Valid', NOT_SIGHTED: 'Not sighted', NO_DATE: 'No date entered',
  }[flag];

  useEffect(() => {
    if (c.sighted_state === 'YES' && flag === 'EXPIRED') onState('NON_CONFORMING');
    else if (c.sighted_state === 'NO') onState('NON_CONFORMING');
    else if (c.sighted_state === 'NOT_APPLICABLE') onState('NOT_APPLICABLE');
    else if (c.sighted_state === 'YES' && (flag === 'VALID' || flag === 'EXPIRING_SOON')) onState('CONFORMING');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.sighted_state, c.valid_until, inspectionDate]);

  return (
    <>
      <Ternary
        value={{ YES: 'CONFORMING', NO: 'NON_CONFORMING', NOT_APPLICABLE: 'NOT_APPLICABLE' }[c.sighted_state]}
        onChange={v => onChange({
          sighted_state: { CONFORMING: 'YES', NON_CONFORMING: 'NO', NOT_APPLICABLE: 'NOT_APPLICABLE' }[v] || null,
        })} />
      {c.sighted_state === 'YES' && (
        <div className="sub">
          <div className="grid2">
            <div>
              <label>Valid until</label>
              <input type="date" value={c.valid_until || ''}
                onChange={e => onChange({ valid_until: e.target.value })} />
            </div>
            <div>
              <label>Issued by</label>
              <input value={c.issued_by || ''} onChange={e => onChange({ issued_by: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 9 }}>
            <span className={`badge ${badge}`}>{wording}</span>
            {flag === 'EXPIRED' && (
              <span style={{ fontSize: 13.5, color: 'var(--danger)', marginLeft: 9 }}>
                Flagged automatically. Classify it below.
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MultiSelect({ options, value, onChange }) {
  const selected = value ? value.split('|') : [];
  const toggle = label => {
    const next = selected.includes(label) ? selected.filter(s => s !== label) : [...selected, label];
    onChange(next.join('|'));
  };
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.option_id} type="button" className="chip"
          aria-pressed={selected.includes(o.option_label)}
          onClick={() => toggle(o.option_label)}>{o.option_label}</button>
      ))}
    </div>
  );
}

function Evidence({ itemId, evidence, onAdd, onRemove }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const made = (evidence || []).map(e => ({ id: e.id, url: URL.createObjectURL(e.blob) }));
    setUrls(made);
    return () => made.forEach(m => URL.revokeObjectURL(m.url));
  }, [evidence]);

  return (
    <div style={{ marginTop: 11 }}>
      <label htmlFor={`e-${itemId}`} style={{ display: 'inline-block', marginBottom: 0 }}>
        Photographic evidence
      </label>
      <input id={`e-${itemId}`} type="file" accept="image/*" capture="environment"
        style={{ minHeight: 0, padding: '7px 0', border: 0, fontSize: 14 }}
        onChange={e => { if (e.target.files?.[0]) { onAdd(itemId, e.target.files[0]); e.target.value = ''; } }} />
      {urls.length > 0 && (
        <div className="thumbs">
          {urls.map(u => (
            <span key={u.id} style={{ position: 'relative', display: 'inline-block' }}>
              <img src={u.url} alt="" />
              <button type="button" onClick={() => onRemove(u.id)}
                style={{ position: 'absolute', top: 2, right: 2 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
