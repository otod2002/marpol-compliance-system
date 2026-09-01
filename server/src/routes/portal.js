'use strict';
/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES. Backs three new portal pages
 * (Records.jsx, CorrectiveAction.jsx, Enquiry.jsx) that had no server
 * endpoint to call. All three routes below are genuinely public (no
 * `authenticate`) — deliberately, since the portal has no sign-in flow
 * anywhere and Home.jsx advertises "No account needed."
 *
 * ONE REAL DECISION THIS FILE DOES NOT MAKE FOR YOU, flagged rather than
 * silently resolved:
 *
 *   Records.jsx anticipates a 401/403 ("Records for a vessel are released
 *   to its agent. Sign in, or contact inspectors for access.") — but there
 *   is no sign-in anywhere on the portal, and the server's existing vessel
 *   history endpoint (inspections.js, /vessels/:imo/history) is restricted
 *   to signed-in officers, which an outside agent can never be. Rather
 *   than invent an authentication scheme for the public portal (a real
 *   security decision that belongs in your report, not guessed by me),
 *   this file adds a SEPARATE, fully public endpoint below
 *   (/vessels/:imo/history/public) that Records.jsx actually calls. It
 *   currently treats "knows the IMO number" as sufficient to see that
 *   vessel's inspection outcomes — the same trust model Track.jsx already
 *   uses for request references. If that's not the access control you
 *   intend (e.g. you want to require the request/case reference too, or a
 *   proper agent login), narrow the WHERE clause or add a second required
 *   field here — this is the one line in the whole PWA/portal build where
 *   I deliberately left the actual security boundary for you to set.
 */
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');

const router = express.Router();

/* ---------------------------------------------------- vessel records --- */

/** FR-09, public variant. See the file-level note above on access control. */
router.get('/vessels/:imo/history/public', async (req, res, next) => {
  try {
    if (!/^\d{7}$/.test(req.params.imo)) {
      return res.status(400).json({ error: 'IMO number must be seven digits' });
    }
    const { rows } = await query(
      `SELECT i.inspection_id, i.mci_number, i.inspection_date, i.compliance_score,
              i.compliance_state, c.case_reference, c.port,
              count(DISTINCT d.deficiency_id) AS deficiencies,
              count(DISTINCT w.wcn_id)        AS waste_notes,
              count(DISTINCT r.recon_id) FILTER (WHERE r.variance_flag = 'BEYOND_TOLERANCE')
                AS variances_beyond_tolerance
         FROM inspection i
         JOIN compliance_case c ON c.case_id = i.case_id
         JOIN vessel v          ON v.vessel_id = c.vessel_id
         LEFT JOIN deficiency d ON d.inspection_id = i.inspection_id
         LEFT JOIN waste_collection_note w ON w.inspection_id = i.inspection_id
         LEFT JOIN reconciliation r ON r.wcn_id = w.wcn_id
        WHERE v.imo_number = $1 AND i.approved_at IS NOT NULL
        GROUP BY i.inspection_id, c.case_reference, c.port
        ORDER BY i.inspection_date DESC
        LIMIT 50`, [req.params.imo]);
    return res.json({ imo_number: req.params.imo, inspections: rows });
  } catch (e) { return next(e); }
});

/* ------------------------------------------------- corrective action --- */

/** FR-10: an agent submits evidence a raised deficiency was rectified. */
router.post('/corrective-action', async (req, res, next) => {
  try {
    const { mci_number, deficiency_code, action_taken, contact, evidence_name } = req.body || {};
    if (!mci_number || !deficiency_code || !action_taken || action_taken.trim().length < 20) {
      return res.status(400).json({ error: 'mci_number, deficiency_code and a substantive action_taken are required' });
    }
    const { rows } = await query(
      `SELECT def.deficiency_id
         FROM deficiency def
         JOIN inspection i ON i.inspection_id = def.inspection_id
         JOIN deficiency_code dc ON dc.code_id = def.code_id
        WHERE i.mci_number = $1 AND dc.code = $2`, [mci_number, deficiency_code]);
    if (!rows.length) {
      return res.status(404).json({ error: 'No deficiency matches that MCI number and deficiency code' });
    }
    const { rows: ins } = await query(
      `INSERT INTO corrective_action (deficiency_id, assigned_to, action_taken, evidence_path, submitted_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING ca_id, submitted_at`,
      [rows[0].deficiency_id, contact || null, action_taken.trim(), evidence_name || null]);

    res.locals.auditEntity = 'corrective_action';
    res.locals.auditEntityId = ins[0].ca_id;
    res.locals.auditAction = 'SUBMIT_EVIDENCE';
    return res.status(201).json({ ca_id: ins[0].ca_id, submitted_at: ins[0].submitted_at });
  } catch (e) { return next(e); }
});

/* ---------------------------------------------------------- enquiries --- */

function threadReference() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ENQ-${year}-${rand}`;
}

/** FR-13: a public enquiry, kept as a thread so a reply attaches to it. */
router.post('/enquiries', async (req, res, next) => {
  try {
    const { subject, category, vessel_imo, sender_name, sender_email, sender_phone, body } = req.body || {};
    if (!subject || !sender_name || (!sender_email && !sender_phone) || !body || body.trim().length < 15) {
      return res.status(400).json({ error: 'subject, sender_name, an email or phone, and a substantive body are required' });
    }
    const reference = threadReference();
    const { rows } = await query(
      `INSERT INTO enquiry_thread (thread_reference, subject, category, vessel_imo, sender_name, sender_email, sender_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING thread_id, created_at`,
      [reference, subject.trim(), category || null, vessel_imo || null,
        sender_name.trim(), sender_email || null, sender_phone || null]);
    await query(
      `INSERT INTO enquiry_message (thread_id, sender_type, sender_name, body)
       VALUES ($1,'PUBLIC',$2,$3)`,
      [rows[0].thread_id, sender_name.trim(), body.trim()]);

    res.locals.auditEntity = 'enquiry_thread';
    res.locals.auditEntityId = rows[0].thread_id;
    res.locals.auditAction = 'RAISE_ENQUIRY';
    return res.status(201).json({ thread_reference: reference, created_at: rows[0].created_at });
  } catch (e) { return next(e); }
});

module.exports = router;
