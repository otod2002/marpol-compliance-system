import React from 'react';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. No code was provided, only the
 * mockup (portal-using-portal.png). The six steps here are the exact same
 * copy shown in your very first portal-guide.png mockup, transcribed
 * directly, not rewritten.
 */

const STEPS = [
  ['Lodge', 'You submit a request here, telephone an inspector, or the vessel simply arrives at berth. All three reach the same work queue.'],
  ['Triage', 'A compliance officer reviews the request and opens a compliance case against the vessel.'],
  ['Inspect', 'The officer attends with the inspection instrument and, where waste is to be landed, a collection note. The master and the NIMASA team sign.'],
  ['Collect', 'A NIMASA waste unit attends at the booked time and records what was actually collected from the vessel.'],
  ['Deliver', 'The unit conveys the waste to a port reception facility, which records what it received and signs for it.'],
  ['Reconcile', 'What you declared, what was booked, what was collected and what was received are compared automatically. A material difference is raised for review.'],
];

export default function Guide({ go }) {
  return (
    <div className="wrap page">
      <a className="back" href="#/" onClick={e => { e.preventDefault(); go('/'); }}>&larr; Services</a>
      <h1>Using this portal</h1>
      <p className="lede">
        A request moves through six stages. The order matters: each stage records
        something the next one depends on.
      </p>

      <div className="panel">
        {STEPS.map(([name, text], i) => (
          <div key={name} style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16,
            padding: '15px 4px',
            borderBottom: i < STEPS.length - 1 ? '1px solid var(--line)' : 'none',
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
          </div>
        ))}
      </div>

      <div className="notice" style={{ marginTop: 20 }}>
        Keep the reference issued when you lodge a request. It is the only thing
        needed to track it, and it links your inspection to any waste collected.
      </div>
    </div>
  );
}
