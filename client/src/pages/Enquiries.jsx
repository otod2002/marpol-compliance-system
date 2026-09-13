import React, { useEffect, useState } from 'react';
import { get, post, patch } from '../api.js';
import { clearDevice } from '../db.js';

const ROLE_LABEL = {
  COMPLIANCE_OFFICER: 'Compliance officer', SUPERVISOR: 'Supervisor', ADMINISTRATOR: 'Administrator',
};

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES, AND NOT REQUESTED UNTIL NOW.
 * server/src/routes/portal.js has accepted public enquiries since early in
 * this project, but nothing anywhere let a compliance officer or
 * supervisor read one, or reply — this closes that gap end to end.
 * No mockup exists for this screen, so the layout follows the established
 * pattern (masthead, panel, queue-row) rather than a specific design.
 */
export default function Enquiries({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [threads, setThreads] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('OPEN');

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function signOut() { await clearDevice(); onSignedOut(); }

  const loadList = async f => {
    const r = await get(`/enquiries${f ? `?status=${f}` : ''}`);
    if (r.ok) setThreads(r.body); else setMsg({ bad: true, text: r.body.error });
  };
  useEffect(() => { loadList(filter); }, [filter]);

  async function open(id) {
    setOpenId(id); setDetail(null); setReply('');
    const r = await get(`/enquiries/${id}`);
    if (r.ok) { setDetail(r.body); loadList(filter); } // reload list so read-state / unread badge updates
    else setMsg({ bad: true, text: r.body.error });
  }

  async function sendReply() {
    if (reply.trim().length < 2) { setMsg({ bad: true, text: 'Write a reply first.' }); return; }
    setBusy(true);
    const r = await post(`/enquiries/${openId}/reply`, { body: reply.trim() });
    setBusy(false);
    if (r.ok) { setReply(''); open(openId); }
    else setMsg({ bad: true, text: r.body.error });
  }

  async function toggleStatus(status) {
    const r = await patch(`/enquiries/${openId}`, { status });
    if (r.ok) { open(openId); }
    else setMsg({ bad: true, text: r.body.error });
  }

  return (
    <>
      <header className="masthead field">
        <div className="masthead-inner">
          <div className="brand-text">
            <span className="brand-name">Marpol Field</span>
            <span className="brand-sub">{me?.full_name} &middot; {ROLE_LABEL[me?.role] || me?.role}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <button className="btn ghost small" onClick={() => go('/queue')}>Queue</button>
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
        <h1>Enquiries</h1>
        <p className="lede">
          Questions raised through the public portal's Contact Inspectors form.
          Opening one marks it read; a reply is visible to the sender the next
          time this system delivers a notification to them.
        </p>

        {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

        <div className="chips" style={{ marginBottom: 14 }}>
          {['OPEN', 'CLOSED', ''].map(f => (
            <button key={f || 'ALL'} className="chip" aria-pressed={filter === f}
              onClick={() => setFilter(f)}>{f || 'All'}</button>
          ))}
        </div>

        <div className="panel" style={{ minHeight: 90 }}>
          {threads === null && <p className="empty">Loading…</p>}
          {threads && threads.length === 0 && <p className="empty">Nothing here.</p>}
          {threads && threads.map(t => (
            <div className="queue-row" key={t.thread_id} onClick={() => open(t.thread_id)}>
              <div>
                <strong>{t.subject}</strong>
                {t.has_unread && <span className="badge expired" style={{ marginLeft: 8 }}>New</span>}
                <div className="mono meta">
                  {t.thread_reference} &middot; {t.sender_name || 'Unnamed'}
                  {t.vessel_imo ? ` · IMO ${t.vessel_imo}` : ''} &middot; {t.message_count} message{t.message_count === 1 ? '' : 's'}
                </div>
              </div>
              <span className={`status ${t.status === 'OPEN' ? 'queued' : 'synced'}`}>{t.status}</span>
            </div>
          ))}
        </div>

        {openId && (
          <div className="sheet" role="dialog" aria-label="Enquiry thread">
            <div className="sheet-in">
              {!detail && <p className="empty">Loading…</p>}
              {detail && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{detail.thread.subject}</h2>
                      <div className="ref">
                        {detail.thread.thread_reference} &middot; {detail.thread.category || 'General'}
                        {detail.thread.vessel_imo ? ` · IMO ${detail.thread.vessel_imo}` : ''}
                      </div>
                      <div className="ref">
                        {detail.thread.sender_name}
                        {detail.thread.sender_email ? ` · ${detail.thread.sender_email}` : ''}
                        {detail.thread.sender_phone ? ` · ${detail.thread.sender_phone}` : ''}
                      </div>
                    </div>
                    <button className="btn ghost small" onClick={() => setOpenId(null)}>Close</button>
                  </div>

                  <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.messages.map(m => (
                      <div key={m.message_id} className="item" style={{
                        borderLeftColor: m.sender_type === 'OFFICER' ? 'var(--flag)' : 'var(--line)',
                        marginBottom: 0,
                      }}>
                        <div className="code">
                          {m.sender_type === 'OFFICER' ? 'NIMASA' : 'SENDER'} &middot; {m.sender_name || '—'} &middot; {new Date(m.sent_at).toLocaleString()}
                        </div>
                        <div style={{ marginTop: 4 }}>{m.body}</div>
                      </div>
                    ))}
                  </div>

                  <div className="field">
                    <label htmlFor="reply-body">Reply</label>
                    <textarea id="reply-body" rows={4} value={reply} onChange={e => setReply(e.target.value)} />
                  </div>
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button className="btn small" disabled={busy} onClick={sendReply}>
                      {busy ? 'Sending…' : 'Send reply'}
                    </button>
                    {detail.thread.status === 'OPEN'
                      ? <button className="btn ghost small" onClick={() => toggleStatus('CLOSED')}>Close enquiry</button>
                      : <button className="btn ghost small" onClick={() => toggleStatus('OPEN')}>Reopen</button>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
