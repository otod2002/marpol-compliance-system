import React from 'react';
import { LoadLine, AnnexStrip } from '../components/Chrome.jsx';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. No code was provided for this
 * page, only the mockup (portal-marpol-annexes.png). Content below is
 * transcribed directly from that mockup, not invented — the certificate
 * and record lists per annex match what's shown there exactly.
 */

const ANNEXES = [
  ['I', 'Oil', ['International Oil Pollution Prevention (IOPP) Certificate', 'Shipboard Oil Pollution Emergency Plan (SOPEP)', 'Oil Record Book Part I, and Part II for tankers', 'Oily water separating equipment and the 15 ppm alarm']],
  ['II', 'Noxious Liquid Substances', ['Certificate of Fitness or NLS Certificate', 'Cargo Record Book', 'Procedures and Arrangements Manual']],
  ['III', 'Harmful Substances in Packaged Form', ['Stowage plan or location listing for harmful substances', 'Marking and labelling of packaged goods']],
  ['IV', 'Sewage', ['International Sewage Pollution Prevention (ISPP) Certificate', 'Sewage treatment plant or holding arrangement', 'Standard discharge connection']],
  ['V', 'Garbage', ['Garbage Management Plan, specific to the vessel', 'Garbage Record Book', 'Segregation by category and labelled receptacles', 'Placards displayed where required']],
  ['VI', 'Air Pollution', ['International Air Pollution Prevention (IAPP) Certificate', 'Ozone-Depleting Substances Record Book', 'Bunker delivery notes and retained fuel samples']],
];

export default function Conventions({ go }) {
  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>MARPOL Annexes</h1>
      <p className="lede">
        An officer inspects against six Annexes. Have these records to hand before
        the officer boards; a certificate that has expired is the single most
        common finding, and it is checked first.
      </p>

      <AnnexStrip />

      <LoadLine />

      <div className="grid two">
        {ANNEXES.map(([num, name, items]) => (
          <div className="card" key={num} style={{ cursor: 'default' }}>
            <div className="num" style={{
              fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--flag)', letterSpacing: '.06em',
            }}>ANNEX {num}</div>
            <h3>{name}</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>MARPOL Annex {num}</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink)', fontSize: 14.5 }}>
              {items.map(it => <li key={it} style={{ marginBottom: 4 }}>{it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
