import React from 'react';
import { LoadLine } from '../components/Chrome.jsx';

/**
 * OFFICER SIGN IN.
 *
 * This page does not carry a password field, and that is deliberate. Officers
 * work in the field application, which is a separate installable surface with
 * its own offline shell and local store. Putting a second sign-in form here
 * would create a second authentication surface serving no purpose, and would
 * invite an officer to sign in on a page that cannot then hold their work.
 *
 * What the page does instead is the thing officers actually get wrong: it
 * tells them to install and sign in BEFORE going alongside, because the
 * instrument pack caches at sign-in and a vessel is exactly where there is
 * no connection to fetch it.
 */

const ROLES = [
  ['Compliance officer', 'Attends the vessel, completes the MARPOL Compliance Inspection across the six Annexes, records waste declared for landing, and books collection.'],
  ['Waste collection team leader', 'Attests what was actually collected from the vessel. Cannot attest receipt ashore.'],
  ['Reception facility receiver', 'Attests what was received at the facility. Cannot attest collection from the vessel.'],
  ['Supervisor', 'Reviews and approves submissions, verifies corrective action closure, and examines reconciliation variance.'],
  ['Administrator', 'Maintains instruments, code vocabularies, and user accounts.'],
];

const INSTALL = [
  ['Open the field application', 'Use the link below on the tablet you will carry aboard. Chrome or Safari, on a device of at least ten inches.'],
  ['Install it to the home screen', 'Chrome: the install prompt, or menu then Install app. Safari: Share then Add to Home Screen. It then launches without browser chrome, like any other application.'],
  ['Sign in while you still have a connection', 'Signing in downloads and caches the instrument pack for all six Annexes. This is the step that makes the inspection work with no signal.'],
  ['Check the connectivity badge', 'The top bar shows Online or Offline, and the number of records still waiting to send. Confirm your work has synchronised before you sign out.'],
];

const FIELD_APP_URL = import.meta.env.VITE_FIELD_APP_URL || 'http://localhost:5174';

export default function OfficerSignIn({ go }) {
  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Officer sign in</h1>
      <p className="lede">
        Compliance officers, waste collection teams, reception facility receivers,
        supervisors and administrators work in the field application. It installs to
        a tablet and operates aboard a vessel with no connection at all.
      </p>

      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>Sign in before you go alongside.</strong> The inspection instrument is
        downloaded when you sign in. A vessel is precisely where there is no signal
        to download it.
      </div>

      <div className="actions" style={{ marginBottom: 26 }}>
        <a className="btn" href={FIELD_APP_URL} target="_blank" rel="noreferrer">
          Open the field application
        </a>
      </div>

      <LoadLine />

      <section className="band" style={{ paddingBottom: 10 }}>
        <div className="band-head">
          <h2>Installing on a tablet</h2>
          <span className="note">Once, before your first inspection.</span>
        </div>
        <div className="panel">
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {INSTALL.map(([name, text], i) => (
              <li key={name} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16,
                padding: '15px 0',
                borderBottom: i < INSTALL.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--flag)',
                  letterSpacing: '.08em', paddingTop: 3,
                }}>{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <strong style={{
                    fontFamily: 'var(--display)', textTransform: 'uppercase',
                    letterSpacing: '.05em', fontSize: 17, display: 'block',
                  }}>{name}</strong>
                  <span style={{ color: 'var(--ink-2)', fontSize: 15 }}>{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <LoadLine />

      <section className="band" style={{ paddingBottom: 10 }}>
        <div className="band-head">
          <h2>What each role may do</h2>
          <span className="note">One role per account. The role decides what the holder can record.</span>
        </div>
        <div className="grid two">
          {ROLES.map(([name, note]) => (
            <div className="card" key={name} style={{ cursor: 'default' }}>
              <h3>{name}</h3>
              <p>{note}</p>
            </div>
          ))}
        </div>
      </section>

      <LoadLine />

      <section className="band">
        <div className="band-head"><h2>No account yet</h2></div>
        <div className="panel">
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            Accounts are created by an administrator, who assigns the role and the
            zone. Ask your supervisor or the Marine Environment Management Department
            to have one issued. Accounts are never shared: every inspection, custody
            attestation and audit entry records the individual who made it, and a
            shared account would make that record meaningless.
          </p>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn ghost" onClick={() => go('/enquiry')}>Contact inspectors</button>
          </div>
        </div>
      </section>
    </div>
  );
}
