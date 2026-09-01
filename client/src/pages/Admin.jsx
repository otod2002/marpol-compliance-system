import React, { useEffect, useState } from 'react';
import { get, post, patch } from '../api.js';
import { clearDevice } from '../db.js';

const ROLE_LABEL = {
  COMPLIANCE_OFFICER: 'Compliance officer',
  WASTE_TEAM_LEADER: 'Waste team leader',
  FACILITY_RECEIVER: 'Reception facility receiver',
  SUPERVISOR: 'Supervisor',
  ADMINISTRATOR: 'Administrator',
  VESSEL_AGENT: 'Vessel agent',
};

const ROLE_NOTE = {
  COMPLIANCE_OFFICER: 'Conducts inspections and books waste collection.',
  WASTE_TEAM_LEADER: 'Attests collection from the vessel. Cannot attest receipt ashore.',
  FACILITY_RECEIVER: 'Attests receipt at the facility. Cannot attest collection.',
  SUPERVISOR: 'Reviews, approves, verifies closure, and sees reconciliation variance.',
  ADMINISTRATOR: 'Maintains instruments, vocabularies, and accounts.',
  VESSEL_AGENT: 'Reads records for its own vessel through the public portal.',
};

/** FR-50 : account, role, and zone administration. Accounts are deactivated,
 *  never deleted, because a user identifier appears on inspections, custody
 *  attestations and audit entries; deleting the row would orphan evidence.
 *
 *  Added here: the masthead. The uploaded draft had none, which meant an
 *  administrator who navigated to Accounts had no way back to the queue
 *  and no sign-out — matching pwa-admin-new-account.png's own header,
 *  which shows exactly these two controls. */
export default function Admin({ me, go, onSignedOut }) {
  const [online, setOnline] = useState(navigator.onLine);

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

  const [users, setUsers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ full_name: '', email: '', password: '', role_name: 'COMPLIANCE_OFFICER', zone: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Fixed here: get() throws on a non-2xx response and returns the parsed
  // body directly on success — it does not return a { ok, body } shape the
  // way post()/patch() do. The original draft assumed the latter, which
  // would have left load() always reporting an error, even on success.
  const load = async () => {
    try {
      setUsers(await get('/users'));
    } catch (e) {
      setMsg({ bad: true, text: e.message });
    }
  };
  useEffect(() => { load(); }, []);

  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function create(e) {
    e.preventDefault(); setMsg(null);
    if (f.password.length < 12) { setMsg({ bad: true, text: 'The password must be at least 12 characters.' }); return; }
    setBusy(true);
    const r = await post('/users', {
      full_name: f.full_name.trim(), email: f.email.trim(),
      password: f.password, role_name: f.role_name, zone: f.zone.trim() || null,
    });
    setBusy(false);
    if (r.status === 201) {
      setMsg({ text: `Account created for ${f.email.trim()}.` });
      setF({ full_name: '', email: '', password: '', role_name: 'COMPLIANCE_OFFICER', zone: '' });
      setShowNew(false); load();
    } else {
      setMsg({ bad: true, text: r.body.error || 'Could not create the account.' });
    }
  }

  async function toggle(u) {
    const verb = u.is_active ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${verb} the account for ${u.email}?`)) return;
    const r = await patch(`/users/${u.user_id}`, { is_active: !u.is_active });
    if (r.ok) { setMsg({ text: `${verb}d ${u.email}.` }); load(); }
    else setMsg({ bad: true, text: r.body.error });
  }

  const active = users.filter(u => u.is_active);
  const inactive = users.filter(u => !u.is_active);

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
            <button className="btn ghost small" onClick={() => go ? go('/queue') : (window.location.hash = '#/queue')}>Queue</button>
            <button className="btn ghost small" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="wrap page">
      <h1>Accounts</h1>
      <p className="lede">
        Every account carries exactly one role, and the role decides what the
        holder may do. Accounts are deactivated rather than deleted, so the record
        of who did what survives.
      </p>

      {msg && <div className={`notice ${msg.bad ? 'bad' : 'good'}`} role="alert">{msg.text}</div>}

      {!showNew && (
        <div className="actions" style={{ marginBottom: 16 }}>
          <button className="btn" onClick={() => setShowNew(true)}>Create an account</button>
        </div>
      )}

      {showNew && (
        <form className="panel" onSubmit={create}>
          <h2 style={{ marginTop: 0 }}>New account</h2>
          <div className="grid2">
            <div>
              <label htmlFor="fn">Full name</label>
              <input id="fn" value={f.full_name} onChange={set('full_name')} required />
            </div>
            <div>
              <label htmlFor="em2">Email</label>
              <input id="em2" type="email" value={f.email} onChange={set('email')} required />
            </div>
            <div>
              <label htmlFor="rn">Role</label>
              <select id="rn" value={f.role_name} onChange={set('role_name')}>
                {Object.keys(ROLE_LABEL).map(k => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="zn">Zone</label>
              <select id="zn" value={f.zone} onChange={set('zone')}>
                <option value="">Not assigned</option>
                <option value="WESTERN">Western</option>
                <option value="CENTRAL">Central</option>
                <option value="EASTERN">Eastern</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="pw2">Initial password</label>
              <input id="pw2" type="text" className="mono" value={f.password} onChange={set('password')}
                placeholder="at least 12 characters" required />
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>
                Stored as a salted Argon2id hash. It cannot be recovered, only reset.
              </div>
            </div>
          </div>

          <div className="notice" style={{ marginTop: 14 }}>
            <strong>{ROLE_LABEL[f.role_name]}.</strong> {ROLE_NOTE[f.role_name]}
          </div>

          <div className="actions" style={{ marginTop: 6 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
            <button className="btn ghost" type="button" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </form>
      )}

      <h2>Active accounts</h2>
      <div className="panel">
        {active.length === 0 && <div className="center">No active accounts.</div>}
        {active.map(u => (
          <div className="row" key={u.user_id}>
            <div>
              <strong>{u.full_name}</strong>
              {u.user_id === me.user_id && <span className="badge grey" style={{ marginLeft: 8 }}>You</span>}
              <div className="ref">{u.email} · {ROLE_LABEL[u.role_name] || u.role_name}{u.zone ? ` · ${u.zone}` : ''}</div>
            </div>
            <button className="chip" onClick={() => toggle(u)}
              disabled={u.user_id === me.user_id}
              title={u.user_id === me.user_id ? 'You cannot deactivate your own account' : ''}>
              Deactivate
            </button>
          </div>
        ))}
      </div>

      {inactive.length > 0 && (
        <>
          <h2>Deactivated</h2>
          <div className="panel">
            {inactive.map(u => (
              <div className="row" key={u.user_id}>
                <div>
                  <strong style={{ color: 'var(--ink-2)' }}>{u.full_name}</strong>
                  <div className="ref">{u.email} · {ROLE_LABEL[u.role_name] || u.role_name}</div>
                </div>
                <button className="chip" onClick={() => toggle(u)}>Reactivate</button>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </>
  );
}
