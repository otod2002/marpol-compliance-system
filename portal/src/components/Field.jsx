import React from 'react';

/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 * Missing from the uploaded bundle. Built to match the .field/.hint/.err
 * classes already defined in styles.css.
 */

export function Field({ id, label, hint, error, span, children }) {
  return (
    <div className={`field${span ? ' span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}

export function Text({ id, mono, ...props }) {
  return <input id={id} className={mono ? 'mono' : undefined} {...props} />;
}

export function Select({ id, options, ...props }) {
  return (
    <select id={id} {...props}>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
