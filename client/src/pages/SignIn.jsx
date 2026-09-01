import React, { useState } from 'react';
import { login } from '../api.js';
import { saveSession } from '../db.js';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES, but built to match pwa-signin.png
 * exactly (copy, field labels, and layout all taken from that mockup).
 */
export default function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(ev) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await login(email.trim(), password);
      await saveSession({ token, user });
      onSignedIn(user);
    } catch (err) {
      setError(err.status === 401 ? 'Incorrect email or password.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap page" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p className="lede">
        Sign in before you go alongside. The instrument pack downloads now so the
        inspection works with no connection.
      </p>

      {error && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 18, width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
