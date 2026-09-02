import React, { useState } from 'react';
import { Field, Text } from '../components/Field.jsx';
import { api } from '../api.js';

const STAGES = [
  ['SUBMITTED',    'Lodged',    'We have your request.'],
  ['ACKNOWLEDGED', 'Received',  'An officer has seen it.'],
  ['SCHEDULED',    'Scheduled', 'An attendance has been arranged.'],
  ['CONVERTED',    'Attended',  'A compliance case is open for this vessel.'],
];

export default function Track({ go }) {
  const [reference, setReference] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  async function look(ev) {
    ev.preventDefault();
    setFailure(null); setResult(null);
    if (!reference.trim()) { setFailure('Enter the reference issued when you lodged the request.'); return; }
    setBusy(true);
    try {
      setResult(await api.trackRequest(reference.trim().toUpperCase()));
    } catch (err) {
      setFailure(err.status === 404
        ? 'No request carries that reference. Check the characters and try again.'
        : err.message);
    } finally { setBusy(false); }
  }

  const reached = result ? STAGES.findIndex(s => s[0] === result.status) : -1;

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Track a request</h1>
      <p className="lede">
        Enter the reference issued when you lodged the request. It looks like
        <span style={{ fontFamily: 'var(--mono)' }}> REQ-2026-A1B2C3</span>.
      </p>

      <form className="panel" onSubmit={look} noValidate style={{ marginBottom: 22 }}>
        <div className="fields">
          <Field id="reference" label="Request reference" span
            error={failure && !result ? failure : null}>
            <Text id="reference" mono value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="REQ-2026-A1B2C3" autoComplete="off" />
          </Field>
        </div>
        <div className="actions" style={{ marginTop: 6 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Looking…' : 'Find request'}
          </button>
        </div>
      </form>

      {result && (
        <div className="receipt">
          <div className="ref">{result.request_reference}</div>
          <span className={`status ${String(result.status).toLowerCase()}`}>{result.status}</span>
          <dl className="kv">
            <dt>Vessel</dt><dd>{result.vessel_name || '—'}</dd>
            <dt>Port</dt><dd>{result.port || '—'}</dd>
            <dt>Lodged</dt><dd>{new Date(result.submitted_at).toLocaleString()}</dd>
          </dl>

          {/* Fixed here: DECLINED is a dead end, not a step on the way to
              CONVERTED — showing it inside the linear stage list above
              would misleadingly render it as "stuck at step 1" rather than
              "this path ended." Shown separately, with the officer's
              reason, matching Triage.jsx's own promise that "the agent can
              see the reason when tracking it." */}
          {result.status === 'DECLINED' ? (
            <div className="notice bad" style={{ marginTop: 18 }}>
              <strong>This request was declined.</strong>
              {result.decline_reason && <div style={{ marginTop: 6 }}>{result.decline_reason}</div>}
            </div>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: '22px 0 0' }}>
              {STAGES.map(([code, name, note], i) => {
                const done = i <= reached;
                return (
                  <li key={code} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0' }}>
                    <span aria-hidden="true" style={{
                      width: 13, height: 13, borderRadius: '50%', marginTop: 5, flex: 'none',
                      border: `1.5px solid ${done ? 'var(--flag)' : 'var(--line)'}`,
                      background: done ? 'var(--flag)' : 'transparent',
                    }} />
                    <span>
                      <strong style={{ color: done ? 'var(--ink)' : 'var(--ink-2)' }}>{name}</strong>
                      <span style={{ color: 'var(--ink-2)', fontSize: 14 }}> — {note}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {result.converted && (
            <div className="notice" style={{ marginTop: 18 }}>
              A compliance case is open. Once the inspection is approved, its outcome
              will appear under vessel records.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
