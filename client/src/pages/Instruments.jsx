import React, { useEffect, useState } from 'react';
import { get, post, patch } from '../api.js';
import { clearDevice } from '../db.js';

/**
 * FR-48, FR-49 : instrument, vocabulary and content administration.
 *
 * The regime is data, so amending it is an administrative act rather than a
 * redeployment (NFR-17). Versions are cloned and published, never edited in
 * place: an inspection captured against version 1 must remain interpretable
 * after version 2 is active, and the server refuses to amend an item that
 * belongs to the active template.
 *
 * Added here: the masthead, same gap already found and fixed in Admin.jsx,
 * Triage.jsx and Supervisor.jsx — this is a desk screen reached by
 * navigation, not a step in a linear task flow, so it needs its own way
 * back to the queue and to sign out, unlike Cargo.jsx/Declarations.jsx/
 * Sign.jsx which correctly have none.
 */
export default function Instruments({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [tab, setTab] = useState('instruments');
  const [tpls, setTpls] = useState([]);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const [codes, setCodes] = useState({ deficiency_codes: [], action_codes: [] });
  const [content, setContent] = useState([]);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState({});

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function signOut() {
    await clearDevice();
    onSignedOut();
  }

  const load = async () => {
    const [t, c, r] = await Promise.all([
      get('/admin/instruments'), get('/admin/codes'), get('/admin/content'),
    ]);
    if (t.ok) setTpls(t.body); else setMsg({ bad: true, text: t.body.error });
    if (c.ok) setCodes(c.body); else setMsg({ bad: true, text: c.body.error });
    if (r.ok) setContent(r.body); else setMsg({ bad: true, text: r.body.error });
  };
  useEffect(() => { load(); }, []);

  async function openItems(t) {
    setOpen(t);
    const r = await get(`/admin/instruments/${t.template_id}/items`);
    if (r.ok) setItems(r.body); else setMsg({ bad: true, text: r.body.error });
  }
  async function newVersion(t) {
    const r = await post(`/admin/instruments/${t.template_id}/new-version`, {});
    setMsg(r.status === 201
      ? { text: `Version ${r.body.version} created as a draft. Amend it, then activate.` }
      : { bad: true, text: r.body.error });
    load();
  }
  async function activate(t) {
    if (!confirm(`Make version ${t.version} the active instrument? Devices will refuse records captured against a retired version.`)) return;
    // Fixed here: post() returns { status, body } — it has no .ok field
    // (only patch() does). Same class of bug already fixed in
    // Supervisor.jsx's approve() and Triage.jsx's decline().
    const r = await post(`/admin/instruments/${t.template_id}/activate`, {});
    setMsg(r.status === 200 ? { text: `Version ${t.version} is now active.` } : { bad: true, text: r.body.error });
    load();
  }
  async function saveItem(it) {
    const body = {};
    if (edit[it.item_id]?.weight !== undefined) body.weight = Number(edit[it.item_id].weight);
    if (edit[it.item_id]?.requirement_text) body.requirement_text = edit[it.item_id].requirement_text;
    const r = await patch(`/admin/items/${it.item_id}`, body);
    if (r.ok) { setMsg({ text: `${it.item_code} amended.` }); openItems(open); }
    else setMsg({ bad: r.status !== 409, text: r.body.note || r.body.error });
  }
  async function publish(c2, is_published) {
    const r = await patch(`/admin/content/${c2.content_id}`, { is_published });
    setMsg(r.ok ? { text: `${c2.title} ${is_published ? 'published' : 'unpublished'}.` } : { bad: true, text: r.body.error });
    load();
  }

  return (
    <>
      <header className="masthead field">
        <div className="masthead-inner">
          <div className="brand-text">
            <span className="brand-name">Marpol Field</span>
            <span className="brand-sub">{me?.full_name} &middot; Administrator</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <button className="btn ghost small" onClick={() => go('/queue')}>Queue</button>
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
      <h1>Instruments and content</h1>
      <p className="lede">
        The inspection instrument, the code vocabularies, and the portal reference
        content are data. Amending them here needs no redeployment.
      </p>
      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      <nav className="annexnav" style={{ top: 56 }}>
        {[['instruments', 'Instrument versions'], ['codes', 'Vocabularies'], ['content', 'Portal content']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setOpen(null); }}>{l}</button>
        ))}
      </nav>

      {tab === 'instruments' && !open && (
        <div className="panel">
          {tpls.map(t => (
            <div className="row" key={t.template_id}>
              <div>
                <strong>{t.form_reference} · version {t.version}</strong>
                {t.is_active && <span className="badge valid" style={{ marginLeft: 8 }}>Active</span>}
                <div className="ref">{t.sections} sections · {t.items} items · effective {t.effective_date}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="chip" onClick={() => openItems(t)}>Items</button>
                {!t.is_active && <button className="chip" onClick={() => activate(t)}>Activate</button>}
                {t.is_active && <button className="chip" onClick={() => newVersion(t)}>New version</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'instruments' && open && (
        <>
          <div className="notice" style={{ marginTop: 12 }}>
            {open.is_active
              ? 'This version is active and cannot be amended. Create a new version, amend that, then activate it.'
              : 'This is a draft version. Amend it freely, then activate it when it is ready.'}
            <button className="chip" style={{ marginLeft: 10 }} onClick={() => setOpen(null)}>Back</button>
          </div>
          {items.map(it => (
            <div className="item" key={it.item_id}>
              <div className="code">{it.annex_code ? `ANNEX ${it.annex_code} · ` : ''}{it.item_code}</div>
              <textarea rows={2} disabled={open.is_active}
                defaultValue={it.requirement_text}
                onChange={e => setEdit({ ...edit, [it.item_id]: { ...edit[it.item_id], requirement_text: e.target.value } })} />
              <div className="grid2" style={{ marginTop: 8 }}>
                <div>
                  <label>Weight</label>
                  <input className="mono" inputMode="decimal" disabled={open.is_active}
                    defaultValue={it.weight}
                    onChange={e => setEdit({ ...edit, [it.item_id]: { ...edit[it.item_id], weight: e.target.value } })} />
                </div>
                <div>
                  <label>Applicability</label>
                  <input className="mono" readOnly
                    value={it.applicability_rule ? JSON.stringify(it.applicability_rule) : 'always applies'} />
                </div>
              </div>
              <div className="cite" style={{ marginTop: 6 }}>{it.convention_reference} · {it.response_type}</div>
              {!open.is_active && (
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="chip" onClick={() => saveItem(it)}>Save</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'codes' && (
        <>
          <h2>Deficiency codes</h2>
          <div className="panel">
            {codes.deficiency_codes.map(c2 => (
              <div className="row" key={c2.code_id}>
                <div>
                  <strong className="mono">{c2.code}</strong>
                  <div className="ref">{c2.description}</div>
                </div>
                <span className="badge grey">{c2.annex_code ? `Annex ${c2.annex_code}` : 'General'}</span>
              </div>
            ))}
          </div>
          <h2>Action codes</h2>
          <div className="panel">
            {codes.action_codes.map(a => (
              <div className="row" key={a.action_id}>
                <div>
                  <strong className="mono">{a.code}</strong>
                  <div className="ref">{a.description}</div>
                </div>
                {a.is_detention && <span className="badge expired">Detainable</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'content' && (
        <div className="panel">
          {content.length === 0 && <div className="center">No reference content loaded.</div>}
          {content.map(c2 => (
            <div className="row" key={c2.content_id}>
              <div>
                <strong>{c2.title}</strong>
                <div className="ref">
                  {c2.content_type}{c2.annex_code ? ` · Annex ${c2.annex_code}` : ''} · {c2.language_code}
                </div>
              </div>
              <button className="chip" onClick={() => publish(c2, !c2.is_published)}>
                {c2.is_published ? 'Unpublish' : 'Publish'}
              </button>
            </div>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
