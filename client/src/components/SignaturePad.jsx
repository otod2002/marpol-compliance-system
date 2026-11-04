import React, { useEffect, useRef, useState } from 'react';

/**
 * A signature panel. The signatory writes with a finger or a stylus and the
 * mark is exported as a PNG data URL, which travels with the inspection in
 * the synchronisation queue and is stored in signatory.signature_path.
 *
 * Pointer events are used in preference to touch or mouse events because a
 * single handler then covers a finger, a stylus and a trackpad, which is
 * what the tablet, the laboratory browser and the desktop reviewer need
 * respectively. The canvas is sized to the device pixel ratio so the line
 * is not blurred on a high-density tablet screen, and touch-action is
 * disabled on it so that drawing does not scroll the page underneath.
 *
 * Nothing here needs a network. The export is synchronous and local, which
 * is what allows an inspection to be signed alongside a vessel with the
 * radios off.
 */
export default function SignaturePad({ label, hint, value, onChange, height = 150 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0A1E2D';
  }, [height]);

  function pos(ev) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function start(ev) {
    ev.preventDefault();
    canvasRef.current.setPointerCapture(ev.pointerId);
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  }

  function move(ev) {
    if (!drawing.current) return;
    ev.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty.current = true;
  }

  function end(ev) {
    if (!drawing.current) return;
    drawing.current = false;
    if (ev.pointerId !== undefined && canvasRef.current.hasPointerCapture?.(ev.pointerId)) {
      canvasRef.current.releasePointerCapture(ev.pointerId);
    }
    if (!dirty.current) return;      // a tap with no stroke is not a signature
    setEmpty(false);
    onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontWeight: 600 }}>{label}</label>
        <button type="button" className="btn ghost small" onClick={clear} disabled={empty}>
          Clear
        </button>
      </div>
      {hint && <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>{hint}</div>}
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        style={{
          width: '100%',
          height,
          display: 'block',
          touchAction: 'none',
          border: '1px solid var(--line)',
          borderRadius: 6,
          background: '#fff',
          cursor: 'crosshair',
        }}
      />
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>
        {empty ? 'Sign above with a finger or stylus.' : 'Signed. Select Clear to sign again.'}
      </div>
    </div>
  );
}
