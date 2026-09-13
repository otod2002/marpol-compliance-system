import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * A QR code rendered on the device, offline.
 *
 * It exists so that a Master holding a printed provisional document can
 * retrieve the definitive one later without anyone emailing anything. The
 * library is bundled rather than fetched, because the code must render at
 * the vessel where there is no network to fetch it from.
 */
export default function Qr({ value, size = 108, caption }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size, margin: 1,
      color: { dark: '#0A1E2D', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    }).catch(() => { /* a missing code must not break the document */ });
  }, [value, size]);
  return (
    <div style={{ textAlign: 'center' }}>
      <canvas ref={ref} width={size} height={size}
        style={{ border: '1px solid var(--line)', borderRadius: 3 }} />
      {caption && (
        <div style={{ fontSize: 10.5, color: 'var(--ink-2)', marginTop: 4, maxWidth: size + 30, lineHeight: 1.3 }}>
          {caption}
        </div>
      )}
    </div>
  );
}
