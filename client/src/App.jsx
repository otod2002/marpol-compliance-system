import React, { useEffect, useState } from 'react';
import { loadSession, loadPack, savePack } from './db.js';
import { fetchInstrumentPack } from './api.js';
import { startAutoSync } from './sync.js';
import SignIn from './pages/SignIn.jsx';
import WorkQueue from './pages/WorkQueue.jsx';
import Inspection from './pages/Inspection.jsx';
import Sign from './pages/Sign.jsx';
import Receipt from './pages/Receipt.jsx';
import Admin from './pages/Admin.jsx';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. A plain hash router with an auth
 * gate: unauthenticated visitors only ever see SignIn; everything else
 * requires a session. Also owns fetching the instrument pack once, right
 * after sign-in, matching the sign-in mockup's own copy ("the instrument
 * pack downloads now so the inspection works with no connection").
 */

function currentRoute() {
  const h = window.location.hash.replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'inspection' && parts[1]) return { name: 'inspection', localId: parts[1] };
  if (parts[0] === 'sign' && parts[1]) return { name: 'sign', localId: parts[1] };
  if (parts[0] === 'receipt' && parts[1]) return { name: 'receipt', localId: parts[1] };
  if (parts[0] === 'admin') return { name: 'admin' };
  return { name: 'queue' };
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [pack, setPack] = useState(null);
  const [route, setRoute] = useState(currentRoute());

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      setUser(session ? session.user : null);
      const cached = await loadPack();
      if (cached) setPack(cached);
      if (session && navigator.onLine) {
        try {
          const fresh = await fetchInstrumentPack();
          await savePack(fresh);
          setPack(fresh);
        } catch { /* offline or expired token: fall back to cached pack */ }
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return startAutoSync();
  }, [user]);

  const go = path => { window.location.hash = `#${path}`; };

  if (user === undefined) return <div className="wrap center">Loading…</div>;

  if (!user) {
    return (
      <SignIn onSignedIn={async u => {
        setUser(u);
        try {
          const fresh = await fetchInstrumentPack();
          await savePack(fresh);
          setPack(fresh);
        } catch { /* pack fetch can retry from the queue screen */ }
        go('/queue');
      }} />
    );
  }

  if (route.name === 'inspection') {
    return <Inspection localId={route.localId} pack={pack} go={go} />;
  }
  if (route.name === 'sign') {
    return <Sign localId={route.localId} go={go} />;
  }
  if (route.name === 'receipt') {
    return <Receipt localId={route.localId} go={go} />;
  }
  if (route.name === 'admin') {
    // Server-enforced too (routes/users.js requires ROLES.ADMINISTRATOR) —
    // this check only spares a non-admin the round trip and the 403.
    if (user.role !== 'ADMINISTRATOR') { go('/queue'); return null; }
    return <Admin me={user} go={go} onSignedOut={() => { setUser(null); go('/'); }} />;
  }
  return <WorkQueue user={user} pack={pack} onOpen={id => go(`/inspection/${id}`)} onSignedOut={() => { setUser(null); go('/'); }} />;
}
