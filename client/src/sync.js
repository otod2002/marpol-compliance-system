/**
 * Synchronisation manager.
 *
 * Releases the queue when connectivity returns and applies the conflict
 * policy stated in Table 3.7. The single most important property, verified
 * by TO-10, is that NOTHING IS EVER SILENTLY OVERWRITTEN. Where the server
 * has advanced beyond the version this device holds, both versions are kept
 * and the inspection is flagged for supervisory adjudication. A routine that
 * resolved the conflict by preferring the later write would destroy evidence,
 * and would defeat the audit capability the whole project rests on.
 */
import {
  pendingQueue, markQueue, dropQueue, getInspection, patchInspection, evidenceFor, db,
} from './db.js';
import { post } from './api.js';

const listeners = new Set();
export const onSyncEvent = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = e => listeners.forEach(fn => fn(e));

/** Stable hash of the substantive payload; identifies a retransmission (TO-09). */
export async function payloadHash(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function toWire(insp) {
  return {
    case_id: insp.case_id,
    template_id: insp.template_id,
    template_version: insp.template_version,
    base_version: insp.base_version,
    inspection_date: insp.inspection_date,
    voyage_no: insp.voyage_no || null,
    agent: insp.agent || null,
    charterer_name: insp.charterer_name || null,
    master_name: insp.master_name || null,
    next_port: insp.next_port || null,
    responses: Object.entries(insp.responses).map(([item_id, r]) => ({
      item_id,
      response_state: r.response_state || 'UNANSWERED',
      response_text: r.response_text ?? null,
      response_date: r.response_date ?? null,
      response_numeric: r.response_numeric ?? null,
      selected_option_id: r.selected_option_id ?? null,
      remark: r.remark ?? null,
      evidence_path: r.evidence_path ?? null,
      deficiency_code_id: r.deficiency_code_id ?? null,
      action_code_id: r.action_code_id ?? null,
    })),
    certificates: Object.values(insp.certificates || {}),
    declarations: insp.declarations || [],
    signatories: insp.signatories || [],
  };
}

let running = false;

/**
 * Release the queue. Safe to call repeatedly; it exits immediately if a run
 * is already in flight, and it stops on the first transport failure so the
 * queue retains its order and nothing is lost.
 */
export async function releaseQueue() {
  if (running || !navigator.onLine) return { skipped: true };
  running = true;
  const results = [];
  try {
    const items = await pendingQueue();
    emit({ type: 'start', pending: items.length });

    for (const item of items) {
      const insp = await getInspection(item.local_id);
      if (!insp) { await dropQueue(item.id); continue; }

      const wire = toWire(insp);
      wire.payload_hash = await payloadHash(wire.responses);

      try {
        const res = await post('/inspections/sync', wire);

        if (res.status === 201 || res.status === 200) {
          const body = res.body;
          await patchInspection(item.local_id, {
            status: 'SYNCED',
            server_id: body.inspection_id,
            mci_number: body.mci_number,
            base_version: body.record_version ?? insp.base_version,
            compliance_score: body.compliance_score,
            compliance_state: body.compliance_state,
            server_outcome: body.outcome,
          });
          await dropQueue(item.id);
          results.push({ local_id: item.local_id, outcome: body.outcome || 'ACCEPTED' });
          emit({ type: 'synced', local_id: item.local_id, mci_number: body.mci_number });

          // Evidence is sent AFTER the record is accepted, and separately.
          // A weak connection then degrades the completeness of evidence
          // transfer rather than the acceptance of the inspection itself
          // (Table 4.2, challenge 5). Each blob is acknowledged on its own,
          // so a partial failure loses only what has not yet gone.
          if (body.inspection_id && body.outcome !== 'DUPLICATE_DISCARDED') {
            await uploadEvidence(item.local_id, body.inspection_id);
          }

          continue;
        }

        if (res.status === 409) {
          // Conflict. Preserve both; do not overwrite either. (TO-08, TO-10)
          const reason = res.body.reason || 'CONFLICT';
          await patchInspection(item.local_id, {
            status: 'CONFLICT',
            conflict_reason: reason,
            conflict_note: res.body.note || res.body.error,
            server_version: res.body.server_version ?? null,
          });
          await markQueue(item.id, 'CONFLICT', reason);
          results.push({ local_id: item.local_id, outcome: 'CONFLICT', reason });
          emit({ type: 'conflict', local_id: item.local_id, reason });
          continue;
        }

        // 4xx that is not a conflict: the payload will not become valid by
        // being retried, so it is held for the officer rather than looped.
        await patchInspection(item.local_id, { status: 'REJECTED', reject_reason: res.body.error });
        await markQueue(item.id, 'REJECTED', res.body.error);
        results.push({ local_id: item.local_id, outcome: 'REJECTED', reason: res.body.error });
        emit({ type: 'rejected', local_id: item.local_id, reason: res.body.error });
      } catch {
        // Transport failure: connectivity went again. Keep the queue intact
        // and stop, so ordering is preserved for the next attempt.
        await markQueue(item.id, 'RETRY', 'network unavailable');
        emit({ type: 'interrupted', local_id: item.local_id });
        break;
      }
    }
  } finally {
    running = false;
    emit({ type: 'end', results });
  }
  return { results };
}

/** Watch connectivity and release automatically on restoration (FR-36). */
export function startAutoSync() {
  const attempt = () => releaseQueue().catch(() => {});
  window.addEventListener('online', attempt);
  const timer = setInterval(attempt, 60000);
  attempt();
  return () => { window.removeEventListener('online', attempt); clearInterval(timer); };
}

/** Transmit each stored photograph, one acknowledged request at a time. */
export async function uploadEvidence(local_id, inspection_id) {
  const blobs = await db.evidence.where('local_id').equals(local_id).toArray();
  let sent = 0;
  for (const e of blobs) {
    if (e.uploaded_at) continue;
    try {
      const data_base64 = await blobToBase64(e.blob);
      const r = await post(`/inspections/${inspection_id}/evidence`, {
        item_id: e.item_id,
        filename: e.name || 'evidence.jpg',
        content_type: e.blob.type || 'image/jpeg',
        data_base64,
      });
      if (r.status === 201) {
        await db.evidence.update(e.id, { uploaded_at: new Date().toISOString(), server_path: r.body.path });
        sent += 1;
        emit({ type: 'evidence', local_id, sent, total: blobs.length });
      } else {
        break;   // a rejection will not become an acceptance on retry
      }
    } catch {
      break;     // connectivity gone; the rest stay for the next release
    }
  }
  return sent;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('could not read evidence'));
    r.readAsDataURL(blob);
  });
}

export { evidenceFor };
