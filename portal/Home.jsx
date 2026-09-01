import React from 'react';
import { LoadLine, AnnexStrip } from '../components/Chrome.jsx';

/**
 * The home page has one job: get an agent to lodge a request, or to find
 * the status of one they have already lodged. Everything is arranged around
 * that, in three bands of decreasing urgency:
 *
 *   1. Request a service   — the two things an arriving vessel needs
 *   2. Track and manage    — what a vessel that already lodged one needs
 *   3. Reference and help  — what someone preparing for a call needs
 *
 * The eleven undifferentiated tiles of a flat grid are deliberately avoided:
 * with every option weighted equally, an agent in a hurry has no first move.
 */
export default function Home({ go }) {
  const nav = path => e => { e.preventDefault(); go(path); };

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Clear your vessel for <em>MARPOL</em> compliance</h1>
          <p>
            Request an inspection or a waste collection for a vessel calling at
            Apapa, Tin Can Island, Onne, Port Harcourt, Warri or Calabar. Track it
            from the moment you lodge it to the moment your waste is received ashore.
          </p>
        </div>
      </section>

      <div className="wrap">
        <section className="band" id="services">
          <div className="band-head">
            <h2>Request a service</h2>
            <span className="note">No account needed. You will receive a reference to track.</span>
          </div>
          <div className="grid two">
            <a className="card primary" href="#/request-inspection" onClick={nav('/request-inspection')}>
              <h3>MARPOL inspection</h3>
              <p>
                Arrange for a NIMASA compliance officer to attend your vessel and
                inspect against MARPOL Annexes I to VI.
              </p>
              <span className="go">Lodge a request &rarr;</span>
            </a>
            <a className="card primary" href="#/request-waste" onClick={nav('/request-waste')}>
              <h3>Waste collection</h3>
              <p>
                Arrange collection of oily waste, sludge, slops, sewage or garbage
                for delivery to a port reception facility.
              </p>
              <span className="go">Lodge a request &rarr;</span>
            </a>
          </div>
        </section>

        <LoadLine />

        <section className="band">
          <div className="band-head">
            <h2>Track and manage</h2>
            <span className="note">Use the reference issued when you lodged your request.</span>
          </div>
          <div className="grid three">
            <a className="card" href="#/track" onClick={nav('/track')}>
              <h3>Track a request</h3>
              <p>Check whether your request has been received, scheduled, or attended.</p>
            </a>
            <a className="card" href="#/records" onClick={nav('/records')}>
              <h3>Vessel records</h3>
              <p>Review inspection outcomes and deficiencies recorded against your vessel.</p>
            </a>
            <a className="card" href="#/corrective-action" onClick={nav('/corrective-action')}>
              <h3>Corrective action</h3>
              <p>Submit evidence that a deficiency raised on your vessel has been rectified.</p>
            </a>
          </div>
        </section>

        <LoadLine />

        <section className="band">
          <div className="band-head">
            <h2>Reference and help</h2>
          </div>
          <div className="grid four">
            <a className="card muted" href="#/conventions" onClick={nav('/conventions')}>
              <h3>MARPOL Annexes</h3>
              <p>What each Annex requires and which records an officer will ask to see.</p>
            </a>
            <a className="card muted" href="#/guide" onClick={nav('/guide')}>
              <h3>Using this portal</h3>
              <p>How a request moves from lodgement to inspection and waste delivery.</p>
            </a>
            <a className="card muted" href="#/enquiry" onClick={nav('/enquiry')}>
              <h3>Contact inspectors</h3>
              <p>Ask a question about an inspection, a certificate, or a waste consignment.</p>
            </a>
            <a className="card muted" href="#/officer" onClick={nav('/officer')}>
              <h3>Officer sign in</h3>
              <p>For NIMASA compliance officers, collection teams and supervisors.</p>
            </a>
          </div>
        </section>

        <LoadLine />

        <section className="band">
          <div className="band-head">
            <h2>What is inspected</h2>
            <span className="note">The Convention fixes these six Annexes and their order.</span>
          </div>
          <AnnexStrip />
        </section>
        <section className="band">
          <div className="band-head">
            <h2>Designed by Dean Omotope (MIT Project)</h2>
            
          </div>
          <AnnexStrip />
        </section>
      </div>
    </>
  );
}
