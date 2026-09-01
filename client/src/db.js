/**
 * Device local store.
 *
 * This is D14 in the Level 1 data flow model, and it is the ONLY store that
 * lives outside the server. Every path from the officer to the server passes
 * through it, which is what makes the offline requirement structural rather
 * than a feature that might be switched off: there is no capture path that
 * depends on connectivity.
 *
 * Four object stores:
 *   pack        the cached instrument, vocabularies, and options
 *   inspections inspections in progress and completed but unsent
 *   evidence    photographs, as blobs, keyed by response
 *   queue       records awaiting synchronisation
 */
import Dexie from 'dexie';

export const db = new Dexie('marpol-field');

db.version(1).stores({
  pack:        'key',                                   // singleton, key = 'active'
  inspections: 'local_id, case_id, status, updated_at',
  evidence:    '++id, local_id, item_id',
  queue:       '++id, local_id, queued_at, state',
  session:     'key',
});

/* ------------------------------------------------------ instrument pack -- */

export async function savePack(pack) {
  await db.pack.put({ key: 'active', pack, cached_at: new Date().toISOString() });
}

export async function loadPack() {
  const row = await db.pack.get('active');
  return row ? row.pack : null;
}

export async function packAge() {
  const row = await db.pack.get('active');
  return row ? row.cached_at : null;
}

/* --------------------------------------------------------- inspections -- */

const uid = () =>
  `L-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

export async function createInspection({ case_id, case_reference, vessel, template_id, template_version }) {
  const rec = {
    local_id: uid(),
    case_id, case_reference, vessel,
    template_id, template_version,
    inspection_date: new Date().toISOString().slice(0, 10),
    voyage_no: '', agent: '', charterer_name: '', master_name: '', next_port: '',
    responses: {},        // item_id -> response
    certificates: {},     // certificate_type -> certificate
    declarations: [],
    signatories: [],
    status: 'IN_PROGRESS',
    server_id: null,
    base_version: null,
    updated_at: new Date().toISOString(),
  };
  await db.inspections.put(rec);
  return rec;
}

export const getInspection = local_id => db.inspections.get(local_id);
export const listInspections = () => db.inspections.orderBy('updated_at').reverse().toArray();

/**
 * Persist immediately on every entry (FR-27, verified by TO-03). The write is
 * not debounced and not deferred: an officer who loses the device mid-boarding
 * loses nothing already typed.
 */
export async function patchInspection(local_id, patch) {
  const cur = await db.inspections.get(local_id);
  if (!cur) throw new Error('inspection not found on device');
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  await db.inspections.put(next);
  return next;
}

export async function setResponse(local_id, item_id, response) {
  const cur = await db.inspections.get(local_id);
  const responses = { ...cur.responses, [item_id]: { ...cur.responses[item_id], ...response } };
  return patchInspection(local_id, { responses });
}

export async function setCertificate(local_id, certificate_type, cert) {
  const cur = await db.inspections.get(local_id);
  const certificates = { ...cur.certificates, [certificate_type]: { certificate_type, ...cur.certificates[certificate_type], ...cert } };
  return patchInspection(local_id, { certificates });
}

/* ------------------------------------------------------------ evidence -- */

/**
 * Downscale and compress before writing. Uncompressed device-camera output
 * would exhaust the storage budget within a single boarding, which is the
 * fourth challenge recorded in Table 4.2.
 */
export async function addEvidence(local_id, item_id, file, maxEdge = 1280, quality = 0.72) {
  const blob = await downscale(file, maxEdge, quality);
  const id = await db.evidence.add({ local_id, item_id, blob, name: file.name, added_at: new Date().toISOString() });
  return id;
}

export const evidenceFor = (local_id, item_id) =>
  db.evidence.where({ local_id, item_id }).toArray();

export const deleteEvidence = id => db.evidence.delete(id);

function downscale(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('could not compress image'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read image')); };
    img.src = url;
  });
}

/** Report storage headroom to the officer before capture capability is lost. */
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, pct: quota ? Math.round((usage / quota) * 100) : null };
}

/* --------------------------------------------------------------- queue -- */

export async function enqueue(local_id) {
  await db.queue.add({ local_id, queued_at: new Date().toISOString(), state: 'PENDING', attempts: 0 });
  await patchInspection(local_id, { status: 'QUEUED' });
}

export const pendingQueue = () => db.queue.where('state').anyOf('PENDING', 'RETRY').sortBy('queued_at');
export const queueCount = () => db.queue.where('state').anyOf('PENDING', 'RETRY').count();
export const markQueue = (id, state, note) => db.queue.update(id, { state, note, attempted_at: new Date().toISOString() });
export const dropQueue = id => db.queue.delete(id);

/* ------------------------------------------------------------- session -- */

export const saveSession = s => db.session.put({ key: 'current', ...s });
export const loadSession = () => db.session.get('current');

/** Clear device-held inspection data on sign-out (NFR-06, TS-11). */
export async function clearDevice() {
  await Promise.all([
    db.inspections.clear(), db.evidence.clear(), db.queue.clear(), db.session.clear(),
  ]);
}
