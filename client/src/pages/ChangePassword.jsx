import React, { useState } from 'react';
import { post } from '../api.js';
import { saveSession } from '../db.js';

/**
 * Shown when an administrator has reset the account's password. Until the
 * holder sets their own, the server refuses every route but this one, so
 * there is nothing else the application can usefully display.
 *
 * The screen is reached online, as sign-in is, and never aboard a vessel:
 * an officer signs in before going alongside, which is where any reset
 * would be dealt with.
 */
export default function ChangePassword({ me, onChanged, onSignedOut }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    if (next.length < 12) return setError('The new password must be at least 12 characters.');
    if (next !== again) return setError('The two new passwords do not match.');
    if (next === current) return setError('The new password must differ from the temporary one.');

    setBusy(true);
    const r = await post('/auth/change-password', { current_password: current, new_password: next });
    setBusy(false);
    if (!r.ok) return setError((r.body && r.body.error) || 'The password could not be changed.');

    await saveSession({ token: r.body.token, user: r.body.user });
    onChanged(r.body.user);
  }

  return (
    <div className="wrap page" style={{ maxWidth: 460 }}>
      <h1>Set your password</h1>
      <p className="lede">
        {me.full_name}, an administrator has reset your password. Choose your own
        before you continue. Nobody else will know it, and an administrator can
        only reset it again, never read it.
      </p>

      {error && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="cur">Temporary password</label>
          <input id="cur" type="password" autoComplete="current-password"
            value={current} onChange={e => setCurrent(e.target.value)} required />
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="new">New password</label>
          <input id="new" type="password" autoComplete="new-password"
            value={next} onChange={e => setNext(e.target.value)} required />
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
            At least 12 characters.
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="again">New password again</label>
          <input id="again" type="password" autoComplete="new-password"
            value={again} onChange={e => setAgain(e.target.value)} required />
        </div>

        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 20, width: '100%' }}>
          {busy ? 'Saving…' : 'Set password and continue'}
        </button>
      </form>

      <button className="btn ghost" onClick={onSignedOut} style={{ marginTop: 14 }}>
        Sign out
      </button>
    </div>
  );
}
