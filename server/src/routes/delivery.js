'use strict';
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const { ROLES, authenticate, authorise } = require('../auth');

const router = express.Router();
const TTL_DAYS = Number(process.env.DOCUMENT_TOKEN_TTL_DAYS || 30);
const PUBLIC_BASE = process.env.PUBLIC_PORTAL_URL || 'http://localhost:5173';

/**
 * DOCUMENT DELIVERY
 *
 * An MCI report exists only after supervisory approval, and a waste note is
 * complete only after the consignment is received ashore. Neither is
 * available when the officer leaves the vessel, yet the Master is entitled
 * to both. Delivery therefore happens after the fact.
 *
 * A LINK is delivered rather than an attachment, for three reasons:
 *   1. Attachments from an unfamiliar sender are routinely quarantined by
 *      shipping-company mail filters. A link arrives where a file does not.
 *   2. A retrieval can be counted. The Agency therefore knows whether the
 *      Master ever collected the document, which an attachment cannot say.
 *   3. Compliance findings are not placed in an inbox the Agency neither
 *      controls nor can withdraw from.
 *
 * Composition is separated from dispatch. Every message is written to an
 * outbox whether or not a transport is configured, so the record of what was
 * composed, for whom, and when survives independently of the transport.
 */

const mkToken = () => crypto.randomBytes(24).toString('base64url');
/** Only the hash is stored. The raw token exists once, in the message. */
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const linkFor = t => `${PUBLIC_BASE}/#/document/${t}`;

async function issue(client, { purpose, inspection_id, wcn_id, issued_to, issued_by }) {
  const raw = mkToken();
  const { rows } = await client.query(
    `INSERT INTO document_access_token
       (token_hash, purpose, inspection_id, wcn_id, issued_to, issued_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING token_id, expires_at`,
    [hash(raw), purpose, inspection_id || null, wcn_id || null,
     issued_to || null, issued_by || null, new Date(Date.now() + TTL_DAYS * 86400000)]);
  return { ...rows[0], token: raw };   // raw returned once, never stored
}

function compose(i, recipientName, links, expires) {
  return [
    recipientName ? `Dear ${recipientName},` : 'Dear Sir or Madam,', '',
    `A MARPOL compliance inspection was conducted aboard ${i.vessel_name} (IMO ${i.imo_number}) at ${i.port || 'a Nigerian port'} on ${i.inspection_date}. The inspection has been reviewed and approved, and the documents arising from it are available below.`,
    '', ...links.map(l => `${l.label}\n${l.url}`), '',
    `These links expire on ${new Date(expires).toDateString()}. Each may be opened without an account.`,
    '',
    'Where a deficiency was raised, evidence of rectification may be submitted through the compliance portal using the MCI number above.',
    '', 'Marine Environment Management Department',
    'Nigerian Maritime Administration and Safety Agency', '',
    'This message records an inspection and supports record-keeping. It does not certify the vessel and carries no regulatory force.',
  ].join('\n');
}

/* ================= COMPOSE AND QUEUE A CASE BUNDLE ================== */
const sendSchema = z.object({
  recipient: z.string().email(),
  recipient_name: z.string().max(200).optional(),
  include_waste_notes: z.boolean().default(true),
});

router.post('/inspections/:id/send', authenticate,
  authorise(ROLES.SUPERVISOR, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const p = sendSchema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: 'invalid payload', detail: p.error.issues });
      const d = p.data;

      const out = await tx(async client => {
        const { rows: ins } = await client.query(
          `SELECT i.inspection_id, i.mci_number, i.approved_at, i.inspection_date,
                  v.vessel_name, v.imo_number, c.port
             FROM inspection i
             JOIN compliance_case c ON c.case_id = i.case_id
             JOIN vessel v ON v.vessel_id = c.vessel_id
            WHERE i.inspection_id = $1`, [req.params.id]);
        if (!ins.length) return { status: 404, body: { error: 'inspection not found' } };
        const i = ins[0];

        if (!i.approved_at) {
          return { status: 409, body: {
            error: 'inspection not yet approved', reason: 'AWAITING_APPROVAL',
            note: 'The definitive report is issued after supervisory approval. Until then the Master holds the provisional receipt issued on the device.' } };
        }

        const links = [];
        const t = await issue(client, { purpose: 'MCI_REPORT', inspection_id: i.inspection_id,
          issued_to: d.recipient, issued_by: req.user.user_id });
        links.push({ label: `MARPOL Compliance Inspection report, MCI ${i.mci_number}`, url: linkFor(t.token) });

        let noteCount = 0;
        if (d.include_waste_notes) {
          const { rows: notes } = await client.query(
            `SELECT wcn_id, wcn_number FROM waste_collection_note
              WHERE inspection_id = $1 ORDER BY wcn_number`, [i.inspection_id]);
          for (const n of notes) {
            const tn = await issue(client, { purpose: 'WASTE_NOTE', wcn_id: n.wcn_id,
              issued_to: d.recipient, issued_by: req.user.user_id });
            links.push({ label: `Controlled waste collection note ${n.wcn_number}`, url: linkFor(tn.token) });
          }
          noteCount = notes.length;
        }

        const subject = `MARPOL inspection ${i.mci_number} — ${i.vessel_name} (IMO ${i.imo_number})`;
        const { rows: msg } = await client.query(
          `INSERT INTO message_outbox
             (recipient, recipient_name, subject, body_text, inspection_id, token_id, queued_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING message_id, state`,
          [d.recipient, d.recipient_name || null, subject,
           compose(i, d.recipient_name, links, t.expires_at), i.inspection_id, t.token_id, req.user.user_id]);

        return { status: 201, body: {
          message_id: msg[0].message_id, state: msg[0].state, recipient: d.recipient,
          subject, links, waste_notes_included: noteCount, expires_at: t.expires_at,
          note: 'Queued in the outbox. Dispatch occurs when a mail transport is configured; the record of composition is retained either way.' } };
      });

      if (out.status === 201) {
        res.locals.auditEntity = 'message_outbox';
        res.locals.auditEntityId = out.body.message_id;
        res.locals.auditAction = 'QUEUE_DOCUMENT_DELIVERY';
        res.locals.auditNew = { recipient: out.body.recipient, documents: out.body.links.length };
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

/* ======================== PUBLIC REDEMPTION ========================= */
/** Resolve a token to a description. No account required: a Master at sea
 *  holds no NIMASA credential. */
router.get('/documents/token/:token', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.token_id, t.purpose, t.expires_at, t.revoked_at, t.retrieval_count,
              i.mci_number, w.wcn_number, v.vessel_name, v.imo_number
         FROM document_access_token t
         LEFT JOIN inspection i ON i.inspection_id = t.inspection_id
         LEFT JOIN waste_collection_note w ON w.wcn_id = t.wcn_id
         LEFT JOIN inspection i2 ON i2.inspection_id = COALESCE(t.inspection_id, w.inspection_id)
         LEFT JOIN compliance_case c ON c.case_id = i2.case_id
         LEFT JOIN vessel v ON v.vessel_id = c.vessel_id
        WHERE t.token_hash = $1`, [hash(req.params.token)]);
    if (!rows.length) return res.status(404).json({ error: 'no document corresponds to that link' });
    const t = rows[0];
    if (t.revoked_at) return res.status(410).json({ error: 'this link has been withdrawn' });
    if (new Date(t.expires_at) < new Date()) return res.status(410).json({ error: 'this link has expired' });
    return res.json({
      purpose: t.purpose, vessel_name: t.vessel_name, imo_number: t.imo_number,
      mci_number: t.mci_number, wcn_number: t.wcn_number, expires_at: t.expires_at,
      download: `/api/documents/token/${req.params.token}/file`,
    });
  } catch (e) { return next(e); }
});

/** Redeem the token for the file. Every retrieval is counted, so the Agency
 *  knows whether the document was ever collected. */
router.get('/documents/token/:token/file', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM document_access_token WHERE token_hash = $1`, [hash(req.params.token)]);
    if (!rows.length) return res.status(404).json({ error: 'no document corresponds to that link' });
    const t = rows[0];
    if (t.revoked_at) return res.status(410).json({ error: 'this link has been withdrawn' });
    if (new Date(t.expires_at) < new Date()) return res.status(410).json({ error: 'this link has expired' });

    await query(`UPDATE document_access_token SET retrieval_count = retrieval_count + 1,
                        last_retrieved_at = now() WHERE token_id = $1`, [t.token_id]);

    // Hand off to the single implementation of each document, carrying the
    // raw token so the shared guard re-verifies it rather than trusting a
    // flag set by this handler.
    // FIXED — rewriting req.url alone does not make Express recompute
    // req.query: query-string parsing happens once, early in the stack,
    // against the ORIGINAL url. Without also setting req.query directly,
    // the downstream route's tokenOrRole guard never sees req.query.t and
    // falls through to requiring a real login — which defeats the entire
    // point of a token-based, no-account retrieval path. Confirmed by
    // actually redeeming a token end-to-end: this returned
    // {"error":"authentication required"} before this fix.
    const q = `?t=${encodeURIComponent(req.params.token)}`;
    req.query = { ...req.query, t: req.params.token };
    if (t.purpose === 'WASTE_NOTE') {
      req.url = `/api/waste-notes/${t.wcn_id}/note.pdf${q}`;
    } else {
      const { rows: rep } = await query(
        `SELECT report_id FROM report WHERE inspection_id=$1 AND report_type='MCI_REPORT'
          ORDER BY generated_at DESC LIMIT 1`, [t.inspection_id]);
      if (!rep.length) return res.status(409).json({ error: 'the report has not yet been generated' });
      req.url = `/api/reports/${rep[0].report_id}.pdf${q}`;
    }
    return req.app.handle(req, res);
  } catch (e) { return next(e); }
});

/* ============================== OUTBOX ============================== */
router.get('/outbox', authenticate, authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT m.message_id, m.recipient, m.recipient_name, m.subject, m.body_text,
                m.state, m.queued_at, m.dispatched_at, m.failure_reason,
                u.full_name AS queued_by_name,
                t.retrieval_count, t.last_retrieved_at, t.expires_at, t.token_id
           FROM message_outbox m
           LEFT JOIN app_user u ON u.user_id = m.queued_by
           LEFT JOIN document_access_token t ON t.token_id = m.token_id
          ORDER BY m.queued_at DESC LIMIT 200`);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

router.post('/outbox/:id/dispatch', authenticate, authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const ok = req.body?.succeeded !== false;
      const { rows } = await query(
        `UPDATE message_outbox SET state = $2,
                dispatched_at = CASE WHEN $2 = 'SENT' THEN now() ELSE NULL END,
                failure_reason = $3
          WHERE message_id = $1 AND state = 'QUEUED' RETURNING message_id, state`,
        [req.params.id, ok ? 'SENT' : 'FAILED', ok ? null : (req.body?.reason || 'transport failure')]);
      if (!rows.length) return res.status(409).json({ error: 'message not found, or no longer queued' });
      res.locals.auditEntity = 'message_outbox';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = ok ? 'DISPATCH' : 'DISPATCH_FAILED';
      return res.json(rows[0]);
    } catch (e) { return next(e); }
  });

router.post('/documents/token/:id/revoke', authenticate,
  authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE document_access_token SET revoked_at = now()
          WHERE token_id = $1 AND revoked_at IS NULL RETURNING token_id`, [req.params.id]);
      if (!rows.length) return res.status(409).json({ error: 'token not found, or already revoked' });
      res.locals.auditEntity = 'document_access_token';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = 'REVOKE_TOKEN';
      return res.json({ revoked: true });
    } catch (e) { return next(e); }
  });

module.exports = router;
