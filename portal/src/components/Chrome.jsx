import React from 'react';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 *
 * Chrome.jsx was missing from the uploaded design bundle. Built to match
 * the .masthead/.loadline/.annexes/.foot classes already defined in
 * styles.css, and the copy shown in your own mockup images — so it's a
 * close reconstruction, not a guess, but you should still check it reads
 * the way you intended.
 */

export function Masthead({ go }) {
  const home = e => { e.preventDefault(); go('/'); };
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <a className="brand" href="#/" onClick={home}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            <span className="brand-name">Marpol Compliance</span>
            <span className="brand-sub">Nigerian Maritime Administration &amp; Safety Agency</span>
          </span>
        </a>
        <div className="lang">
          <span>Language</span>
          <select defaultValue="en" aria-label="Language">
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </header>
  );
}

export function LoadLine({ onDark = false }) {
  return (
    <div className={`loadline${onDark ? ' on-dark' : ''}`} role="presentation">
      <span className="bar" />
      <span className="disc" />
      <span className="bar" />
    </div>
  );
}

const ANNEXES = [
  ['I', 'Oil', 'Oily water, sludge, slops'],
  ['II', 'Noxious liquids', 'Bulk chemical residues'],
  ['III', 'Harmful substances', 'Packaged goods'],
  ['IV', 'Sewage', 'Treatment and holding'],
  ['V', 'Garbage', 'Segregation and landing'],
  ['VI', 'Air pollution', 'Emissions and ODS'],
];

export function AnnexStrip() {
  return (
    <div className="annexes">
      {ANNEXES.map(([num, name, desc]) => (
        <div className="annex" key={num}>
          <div className="num">Annex {num}</div>
          <div className="name">{name}</div>
          <div className="desc">{desc}</div>
        </div>
      ))}
    </div>
  );
}

export function Footer({ go }) {
  const nav = path => e => { e.preventDefault(); go(path); };
  return (
    <footer className="foot">
      <div className="wrap">
        <LoadLine onDark />
        <div className="cols">
          <div>
            <h4>About this portal</h4>
            <p>
              Request a MARPOL compliance inspection or waste collection for a vessel
              calling at a Nigerian port, and follow it through to delivery ashore.
            </p>
          </div>
          <div>
            <h4>Services</h4>
            <ul>
              <li><a href="#/request-inspection" onClick={nav('/request-inspection')}>Request an inspection</a></li>
              <li><a href="#/request-waste" onClick={nav('/request-waste')}>Request waste collection</a></li>
              <li><a href="#/track" onClick={nav('/track')}>Track a request</a></li>
            </ul>
          </div>
          <div>
            <h4>Reference</h4>
            <ul>
              <li><a href="#/conventions" onClick={nav('/conventions')}>MARPOL Annexes</a></li>
              <li><a href="#/guide" onClick={nav('/guide')}>Using this portal</a></li>
              <li><a href="#/enquiry" onClick={nav('/enquiry')}>Contact inspectors</a></li>
            </ul>
          </div>
        </div>
        <p className="disclaimer">
          This system supports inspection and record-keeping. Nothing produced here
          certifies a vessel or facility or carries regulatory force. Built as a
          Professional Master&rsquo;s Project, Miva Open University.
        </p>
      </div>
    </footer>
  );
}
