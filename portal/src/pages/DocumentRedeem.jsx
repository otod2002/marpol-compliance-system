import React, { useEffect, useState } from 'react';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. delivery.js composes links shaped
 * like `${PUBLIC_PORTAL_URL}/#/document/:token` — pointing at the PUBLIC
 * PORTAL, not the field app — but no portal page existed to handle that
 * route. Without this, every link the system composes would lead a Master
 * to a blank "not found" placeholder. Built to match the portal's existing
 * page style (Records.jsx, Track.jsx) rather than a mockup, since none was
 * provided for this specific screen.
 */
export default function DocumentRedeem({ go, params }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const token = params?.token;

  useEffect(() => {
    if (!token) return;
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/documents/token/${token}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `This link could not be opened (${r.status}).`);
        return body;
      })
      .then(setMeta)
      .catch(e => setError(e.message));
  }, [token]);

  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Your document</h1>
      <p className="lede">
        This link was issued for one document. It works without an account, and
        every time it is opened is recorded.
      </p>

      {error && <div className="notice bad" role="alert">{error}</div>}

      {!error && !meta && <div className="panel"><p className="empty">Checking this link…</p></div>}

      {meta && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            {meta.purpose === 'WASTE_NOTE'
              ? `Controlled Waste Collection Note ${meta.wcn_number || ''}`
              : `MARPOL Compliance Inspection Report, MCI ${meta.mci_number || ''}`}
          </h2>
          <dl className="kv2">
            <dt>Vessel</dt><dd>{meta.vessel_name}</dd>
            <dt>IMO number</dt><dd>{meta.imo_number}</dd>
            <dt>Link expires</dt><dd>{new Date(meta.expires_at).toLocaleDateString()}</dd>
          </dl>
          <div className="actions" style={{ marginTop: 16 }}>
            <a className="btn" href={`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}${meta.download}`}
               target="_blank" rel="noreferrer">Download</a>
          </div>
        </div>
      )}
    </div>
  );
}
