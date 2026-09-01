import React, { useEffect, useState } from 'react';
import { Masthead, Footer } from './components/Chrome.jsx';
import Home from './pages/Home.jsx';
import RequestInspection from './pages/RequestInspection.jsx';
import RequestWaste from './pages/RequestWaste.jsx';
import Track from './pages/Track.jsx';
import Records from './pages/Records.jsx';
import CorrectiveAction from './pages/CorrectiveAction.jsx';
import Enquiry from './pages/Enquiry.jsx';
import Conventions from './pages/Conventions.jsx';
import Guide from './pages/Guide.jsx';
import OfficerSignIn from './pages/OfficerSignIn.jsx';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 * Missing from the uploaded bundle. A plain hash router: the four page
 * components already use href="#/path" links and a go(path) prop, so this
 * just reads/writes window.location.hash to match that existing pattern,
 * rather than pulling in a routing library for four pages.
 *
 * Only four pages were included in the uploaded design (Home,
 * RequestInspection, RequestWaste, Track). Home.jsx links to several
 * others (conventions, guide, enquiry, officer, records, corrective-action)
 * that don't exist yet — those fall through to the placeholder below
 * rather than crashing, so you can click around the whole design without
 * the app erroring out on unbuilt pages.
 */

const ROUTES = {
  '/': Home,
  '/request-inspection': RequestInspection,
  '/request-waste': RequestWaste,
  '/track': Track,
  '/records': Records,
  '/corrective-action': CorrectiveAction,
  '/enquiry': Enquiry,
  '/conventions': Conventions,
  '/guide': Guide,
  '/officer': OfficerSignIn,
};

function Placeholder({ go }) {
  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Not yet built</h1>
      <p className="lede">This page isn't part of the design bundle yet.</p>
    </div>
  );
}

function currentPath() {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

export default function App() {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onHashChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const go = nextPath => {
    if (currentPath() === nextPath) { setPath(nextPath); return; }
    window.location.hash = `#${nextPath}`;
  };

  const Page = ROUTES[path] || Placeholder;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Masthead go={go} />
      <main id="main">
        <Page go={go} />
      </main>
      <Footer go={go} />
    </>
  );
}
