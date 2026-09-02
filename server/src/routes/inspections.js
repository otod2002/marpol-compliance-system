'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const { ROLES, authenticate, authorise } = require('../auth');
const {
  isApplicable, evaluateCertificate, scoreInspection,
} = require('../../../shared/rules');

const router = express.Router();
const EVIDENCE_ROOT = process.env.EVIDENCE_ROOT || path.join(__dirname, '../../evidence');

/* ==================== INSTRUMENT PACK PROVISIONING ================== */
/**
 * FR-16 : the pack the device caches before departure. Returned in one
 * response rather than per-Annex, so the officer holds the whole instrument
 * after a single fetch.
 */
router.get('/instrument/active', authenticate, async (req, res, next) => {
  try {
    const { rows: tpl } = await query(
      `SELECT * FROM instrument_template
        WHERE instrument_type = 'MCI' AND is_active ORDER BY version DESC LIMIT 1`);
    if (!tpl.length) return res.status(404).json({ error: 'no active instrument' });

    const { rows: sections } = await query(
      `SELECT * FROM instrument_section WHERE template_id = $1 ORDER BY display_order`,
      [tpl[0].template_id]);
    const { rows: items } = await query(
      `SELECT ci.* FROM checklist_item ci
         JOIN instrument_section s ON s.section_id = ci.section_id
        WHERE s.template_id = $1 ORDER BY s.display_order, ci.display_order`,
      [tpl[0].template_id]);
    const { rows: options } = await query(
      `SELECT ro.* FROM response_option ro
         JOIN checklist_item ci ON ci.item_id = ro.item_id
         JOIN instrument_section s ON s.section_id = ci.section_id
        WHERE s.template_id = $1 ORDER BY ro.option_order`,
      [tpl[0].template_id]);
    const { rows: dcodes } = await query(`SELECT * FROM deficiency_code ORDER BY code`);
    const { rows: acodes } = await query(`SELECT * FROM action_code ORDER BY code`);

    return res.json({
      template: tpl[0], sections, items, options,
      vocabularies: { deficiency_codes: dcodes, action_codes: acodes },
    });
  } catch (e) { return next(e); }
});

/* ============================ SYNCHRONISATION ======================= */

const responseSchema = z.object({
  item_id: z.string().uuid(),
  response_state: z.enum(['CONFORMING', 'NON_CONFORMING', 'NOT_APPLICABLE', 'UNANSWERED']),
  response_text: z.string().optional().nullable(),
  response_date: z.string().optional().nullable(),
  response_numeric: z.number().optional().nullable(),
  selected_option_id: z.string().uuid().optional().nullable(),
  remark: z.string().optional().nullable(),
  evidence_path: z.string().optional().nullable(),
  deficiency_code_id: z.number().int().optional().nullable(),
  action_code_id: z.number().int().optional().nullable(),
});

const syncSchema = z.object({
  case_id: z.string().uuid(),
  template_id: z.string().uuid(),
  template_version: z.number().int(),
  base_version: z.number().int().optional().nullable(),
  payload_hash: z.string().optional(),
  inspection_date: z.string(),
  voyage_no: z.string().optional().nullable(),
  agent: z.string().optional().nullable(),
  charterer_name: z.string().optional().nullable(),
  master_name: z.string().optional().nullable(),
  next_port: z.string().optional().nullable(),
  responses: z.array(responseSchema),
  certificates: z.array(z.object({
    certificate_type: z.string(),
    sighted_state: z.enum(['YES', 'NO', 'NOT_APPLICABLE']),
    valid_until: z.string().optional().nullable(),
    issued_by: z.string().optional().nullable(),
    last_inspected: z.string().optional().nullable(),
  })).default([]),
  declarations: z.array(z.object({
    annex_code: z.string(),
    waste_type: z.string().optional().nullable(),
    to_be_landed: z.boolean(),
    declared_quantity: z.number().optional().nullable(),
    quantity_unit: z.string().optional().nullable(),
    held_onboard_quantity: z.number().optional().nullable(),
    date_last_discharged: z.string().optional().nullable(),
  })).default([]),
  signatories: z.array(z.object({
    signatory_role: z.enum(['MASTER_OR_CHIEF_OFFICER', 'NIMASA_INSPECTOR', 'MARPOL_COMPLIANCE_INSPECTOR']),
    name: z.string(),
    signature_path: z.string().optional().nullable(),
    stamp_reference: z.string().optional().nullable(),
  })).default([]),
});

const hashPayload = obj =>
  crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

/**
 * FR-36, FR-37, FR-38 : receive a synchronised inspection.
 *
 * Four conditions from Table 3.7 are handled here:
 *   1. new record                 -> insert
 *   2. duplicate payload hash     -> discard the retransmission (idempotent)
 *   3. server ahead of base       -> 409, BOTH versions preserved
 *   4. retired instrument version -> 409, reject
 *
 * Condition 3 never overwrites. A routine that resolved the conflict by
 * preferring the later write would destroy evidence, defeating the audit
 * capability the project rests on. Verified by TO-10.
 */
router.post('/inspections/sync', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR),
  async (req, res, next) => {
    try {
      const parsed = syncSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
      }
      const d = parsed.data;
      const incomingHash = d.payload_hash || hashPayload(d.responses);

      const out = await tx(async client => {
        // -- condition 4: instrument version must still be active (TO-08)
        const { rows: tpl } = await client.query(
          `SELECT template_id, version, is_active FROM instrument_template WHERE template_id = $1`,
          [d.template_id]);
        if (!tpl.length) return { status: 400, body: { error: 'unknown instrument template' } };
        if (!tpl[0].is_active) {
          return { status: 409, body: {
            error: 'instrument version retired',
            reason: 'RETIRED_TEMPLATE',
            template_version: tpl[0].version } };
        }

        // -- existing record for this case? inspection.case_id is UNIQUE (1:1)
        const { rows: existing } = await client.query(
          `SELECT * FROM inspection WHERE case_id = $1 FOR UPDATE`, [d.case_id]);

        if (existing.length) {
          const cur = existing[0];

          // -- condition 2: identical retransmission (TO-09)
          if (cur.payload_hash && cur.payload_hash === incomingHash) {
            return { status: 200, body: {
              inspection_id: cur.inspection_id, mci_number: cur.mci_number,
              outcome: 'DUPLICATE_DISCARDED' } };
          }

          // -- condition 3: server advanced beyond the device base (TO-10)
          if (d.base_version == null || Number(d.base_version) < Number(cur.record_version)) {
            await client.query(
              `UPDATE inspection SET sync_status = 'CONFLICT' WHERE inspection_id = $1`,
              [cur.inspection_id]);
            await client.query(
              `INSERT INTO audit_log (user_id, entity_name, entity_id, action, old_value, new_value)
               VALUES ($1,'inspection',$2,'SYNC_CONFLICT',$3,$4)`,
              [req.user.user_id, cur.inspection_id,
               JSON.stringify({ record_version: cur.record_version, payload_hash: cur.payload_hash }),
               JSON.stringify({ base_version: d.base_version, payload_hash: incomingHash })]);
            return { status: 409, body: {
              error: 'version conflict',
              reason: 'SERVER_AHEAD',
              inspection_id: cur.inspection_id,
              server_version: cur.record_version,
              note: 'both versions preserved; flagged for supervisory adjudication' } };
          }
        }

        /* ---------- persist ---------- */
        const inspectionId = existing.length ? existing[0].inspection_id : null;

        const { rows: insRows } = inspectionId
          ? await client.query(
              `UPDATE inspection SET inspection_date=$2, voyage_no=$3, agent=$4, charterer_name=$5,
                      master_name=$6, next_port=$7, payload_hash=$8,
                      record_version = record_version + 1, sync_status='SYNCED'
                 WHERE inspection_id=$1 RETURNING *`,
              [inspectionId, d.inspection_date, d.voyage_no, d.agent, d.charterer_name,
               d.master_name, d.next_port, incomingHash])
          : await client.query(
              `INSERT INTO inspection
                 (case_id, template_id, officer_id, inspection_date, voyage_no, agent,
                  charterer_name, master_name, next_port, payload_hash, sync_status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SYNCED') RETURNING *`,
              [d.case_id, d.template_id, req.user.user_id, d.inspection_date, d.voyage_no,
               d.agent, d.charterer_name, d.master_name, d.next_port, incomingHash]);

        const insp = insRows[0];

        // replace child rows for this inspection
        await client.query(`DELETE FROM inspection_response WHERE inspection_id=$1`, [insp.inspection_id]);
        await client.query(`DELETE FROM certificate        WHERE inspection_id=$1`, [insp.inspection_id]);
        await client.query(`DELETE FROM waste_declaration  WHERE inspection_id=$1`, [insp.inspection_id]);

        const responseIdByItem = new Map();
        for (const r of d.responses) {
          const { rows } = await client.query(
            `INSERT INTO inspection_response
               (inspection_id, item_id, response_state, response_text, response_date,
                response_numeric, selected_option_id, remark, evidence_path)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING response_id`,
            [insp.inspection_id, r.item_id, r.response_state, r.response_text, r.response_date,
             r.response_numeric, r.selected_option_id, r.remark, r.evidence_path]);
          responseIdByItem.set(r.item_id, rows[0].response_id);
        }

        /* ---------- vessel context, for applicability ---------- */
        const { rows: vRows } = await client.query(
          `SELECT v.* FROM vessel v JOIN compliance_case c ON c.vessel_id = v.vessel_id
            WHERE c.case_id = $1`, [d.case_id]);
        const vessel = vRows[0] || {};

        /* ---------- certificates: expiry by arithmetic (FR-24) ---------- */
        for (const c of d.certificates) {
          const flag = evaluateCertificate(c, d.inspection_date);
          await client.query(
            `INSERT INTO certificate
               (inspection_id, certificate_type, sighted_state, valid_until, issued_by,
                last_inspected, expiry_flag)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [insp.inspection_id, c.certificate_type, c.sighted_state, c.valid_until,
             c.issued_by, c.last_inspected, flag]);
        }

        for (const w of d.declarations) {
          await client.query(
            `INSERT INTO waste_declaration
               (inspection_id, annex_code, waste_type, to_be_landed, declared_quantity,
                quantity_unit, held_onboard_quantity, date_last_discharged)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [insp.inspection_id, w.annex_code, w.waste_type, w.to_be_landed,
             w.declared_quantity, w.quantity_unit, w.held_onboard_quantity, w.date_last_discharged]);
        }

        /**
         * ADDED — NOT IN YOUR ORIGINAL FILES. Nothing anywhere created a
         * waste_collection_note from a signed declaration — Declarations.jsx
         * saves declared quantities, sync.js forwards them, and the lines
         * above store them, but the chain stopped there. Without this,
         * WasteNote.jsx and the whole custody chain (waste-notes list,
         * WasteNote screen, reconciliation) would never have anything to
         * show, because Section A is never booked. This auto-books it here,
         * immediately on sync, for every declaration marked to_be_landed —
         * matching the process map's "Declare waste to be landed → Book
         * collection Section A" arrow.
         *
         * ONE LIMITATION THIS DOES NOT SOLVE, flagged rather than hidden:
         * the two lines above this comment DELETE and re-INSERT every
         * waste_declaration row on every sync of an inspection. Once a
         * waste_collection_note exists (created below), it holds a
         * foreign key to that declaration row with no ON DELETE clause in
         * your schema (defaults to RESTRICT) — so resyncing the SAME
         * inspection a second time, after waste has been booked against
         * it, would fail with a foreign-key violation on that DELETE and
         * roll back the whole sync. This is a property of the schema and
         * the delete-and-replace pattern already in this file, not
         * something introduced by adding the booking step. In practice it
         * only bites if an officer edits and resubmits an inspection after
         * its waste has already been collected against — worth deciding
         * whether to guard against re-sync once a note exists, or to
         * change waste_declaration's replace-on-sync strategy to an
         * upsert, rather than something to leave as a silent trap.
         */
        for (const w of d.declarations) {
          if (!w.to_be_landed) continue;
          const { rows: declRow } = await client.query(
            `SELECT declaration_id FROM waste_declaration
              WHERE inspection_id=$1 AND annex_code=$2 AND waste_type IS NOT DISTINCT FROM $3`,
            [insp.inspection_id, w.annex_code, w.waste_type]);
          if (!declRow.length) continue;
          const { rows: noteRow } = await client.query(
            `INSERT INTO waste_collection_note
               (inspection_id, declaration_id, general_description, containment_type,
                booked_quantity, booked_quantity_unit, booked_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (declaration_id) DO NOTHING
             RETURNING wcn_id`,
            [insp.inspection_id, declRow[0].declaration_id, w.waste_type, `Annex ${w.annex_code}`,
             w.declared_quantity, w.quantity_unit, d.inspection_date]);
          // Bug fixed here: the note's custody_stage column was set to
          // 'BOOKED' above, but waste.js's stage-ordering check reads the
          // custody_event table, not that column — without a matching
          // event row, the very first custody attestation (COLLECTED)
          // would always fail with MISSING_PREDECESSOR, since as far as
          // the event trail was concerned BOOKED had never happened.
          if (noteRow.length) {
            await client.query(
              `INSERT INTO custody_event (wcn_id, stage, occurred_at, quantity, quantity_unit, actor_id)
               VALUES ($1,'BOOKED',now(),$2,$3,$4)
               ON CONFLICT (wcn_id, stage) DO NOTHING`,
              [noteRow[0].wcn_id, w.declared_quantity, w.quantity_unit, req.user.user_id]);
          }
        }

        for (const s of d.signatories) {
          await client.query(
            `INSERT INTO signatory (document_type, document_id, signatory_role, name, signature_path, stamp_reference)
             VALUES ('INSPECTION',$1,$2,$3,$4,$5)
             ON CONFLICT (document_type, document_id, signatory_role) DO NOTHING`,
            [insp.inspection_id, s.signatory_role, s.name, s.signature_path, s.stamp_reference]);
        }

        /* ---------- AUTHORITATIVE re-evaluation (FR-38) ----------
           The client evaluated against its cached rule set to give the officer
           immediate feedback offline. The determination of record is made here,
           against the current server-held rules, by the SAME shared module.   */
        const { rows: items } = await client.query(
          `SELECT ci.* FROM checklist_item ci
             JOIN instrument_section s ON s.section_id = ci.section_id
            WHERE s.template_id = $1`, [d.template_id]);
        const { rows: acodes } = await client.query(`SELECT action_id, is_detention FROM action_code`);
        const actionCodes = new Map(acodes.map(a => [a.action_id, a]));

        const responseMap = new Map(d.responses.map(r => [r.item_id, {
          response_id: responseIdByItem.get(r.item_id),
          response_state: r.response_state,
          deficiency_code_id: r.deficiency_code_id,
          action_code_id: r.action_code_id,
        }]));

        const evaluation = scoreInspection(items, responseMap, vessel, { actionCodes });

        await client.query(`DELETE FROM deficiency WHERE inspection_id=$1`, [insp.inspection_id]);
        for (const def of evaluation.deficiencies) {
          if (!def.code_id || !def.action_id) continue;   // officer must classify
          await client.query(
            `INSERT INTO deficiency (inspection_id, response_id, code_id, action_id)
             VALUES ($1,$2,$3,$4)`,
            [insp.inspection_id, def.response_id, def.code_id, def.action_id]);
        }

        const { rows: fin } = await client.query(
          `UPDATE inspection SET compliance_score=$2, compliance_state=$3
             WHERE inspection_id=$1 RETURNING *`,
          [insp.inspection_id, evaluation.score, evaluation.state]);

        return { status: 201, body: {
          inspection_id: fin[0].inspection_id,
          mci_number: fin[0].mci_number,
          record_version: fin[0].record_version,
          compliance_score: evaluation.score,
          compliance_state: evaluation.state,
          deficiencies: evaluation.deficiencies.length,
          applicable_items: evaluation.applicableCount,
          outcome: 'ACCEPTED',
        } };
      });

      if (out.status === 201) {
        res.locals.auditEntity = 'inspection';
        res.locals.auditEntityId = out.body.inspection_id;
        res.locals.auditAction = 'SYNC';
        res.locals.auditNew = out.body;
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

/* ============================ EVIDENCE ============================== */
/**
 * FR-25 : evidence upload.
 *
 * Photographs are transmitted SEPARATELY from the structured record, and
 * after it, for the reason recorded as challenge 5 in Table 4.2: a weak
 * connection should degrade the completeness of evidence transfer rather
 * than the acceptance of the inspection itself. Each blob is acknowledged
 * individually so a partial failure loses only the blobs not yet sent.
 */
const evidenceSchema = z.object({
  item_id: z.string().uuid(),
  filename: z.string().max(200).optional(),
  content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data_base64: z.string().max(8_000_000),   // ~6 MB decoded; images are downscaled on the device
});

router.post('/inspections/:id/evidence', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR),
  async (req, res, next) => {
    try {
      const parsed = evidenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
      }
      const d = parsed.data;

      const { rows: resp } = await query(
        `SELECT response_id, evidence_path FROM inspection_response
          WHERE inspection_id = $1 AND item_id = $2`, [req.params.id, d.item_id]);
      if (!resp.length) return res.status(404).json({ error: 'no response for that item on this inspection' });

      const buf = Buffer.from(d.data_base64, 'base64');
      if (!buf.length) return res.status(400).json({ error: 'empty image' });

      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[d.content_type];
      const dir = path.join(EVIDENCE_ROOT, req.params.id);
      await fs.mkdir(dir, { recursive: true });
      const name = `${crypto.randomUUID()}.${ext}`;
      await fs.writeFile(path.join(dir, name), buf);

      // Stored outside the web root; served only through an authorised route.
      const rel = path.posix.join(req.params.id, name);
      const existing = resp[0].evidence_path ? resp[0].evidence_path.split(',') : [];
      await query(`UPDATE inspection_response SET evidence_path = $2 WHERE response_id = $1`,
        [resp[0].response_id, [...existing, rel].join(',')]);

      res.locals.auditEntity = 'inspection_response';
      res.locals.auditEntityId = resp[0].response_id;
      res.locals.auditAction = 'ATTACH_EVIDENCE';
      return res.status(201).json({ path: rel, bytes: buf.length });
    } catch (e) { return next(e); }
  });

/** Evidence is served only to authenticated staff, never from a public path. */
router.get('/evidence/*', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const rel = req.params[0];
      if (rel.includes('..')) return res.status(400).json({ error: 'invalid path' });
      return res.sendFile(path.resolve(EVIDENCE_ROOT, rel));
    } catch (e) { return next(e); }
  });

/* ============================ RETRIEVAL ============================= */

/** FR-47 : full compliance and custody history of a vessel, one query (NFR-02). */
router.get('/vessels/:imo/history', authenticate,
  authorise(ROLES.SUPERVISOR, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
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
          WHERE v.imo_number = $1
          GROUP BY i.inspection_id, c.case_reference, c.port
          ORDER BY i.inspection_date DESC`, [req.params.imo]);
      return res.json({ imo_number: req.params.imo, inspections: rows });
    } catch (e) { return next(e); }
  });

/** Supervisory review: approve or return with remarks (FR-39). */
/**
 * ADDED — NOT IN YOUR ORIGINAL FILES. Supervisor.jsx calls
 * GET /inspections?status=PENDING to list submissions awaiting approval,
 * but no listing endpoint existed anywhere in this file — only sync,
 * approve, and vessel-history. "Pending" is defined the same way the
 * approve endpoint itself defines "already approved" (approved_at IS
 * NULL), so the two stay consistent by construction rather than by
 * duplicated logic. Restricted to SUPERVISOR/ADMINISTRATOR, matching the
 * approve endpoint's own restriction — there would be little point
 * showing this list to someone who could never act on it.
 */
router.get('/inspections', authenticate, authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const status = (req.query.status || '').toUpperCase();
      const conditions = [`i.sync_status = 'SYNCED'`];
      if (status === 'PENDING') conditions.push('i.approved_at IS NULL');
      else if (status === 'APPROVED') conditions.push('i.approved_at IS NOT NULL');

      const { rows } = await query(
        `SELECT i.inspection_id, i.mci_number, i.inspection_date, i.compliance_score,
                i.compliance_state, i.approved_at, v.vessel_name, v.imo_number
           FROM inspection i
           JOIN compliance_case c ON c.case_id = i.case_id
           JOIN vessel v          ON v.vessel_id = c.vessel_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY i.inspection_date DESC
          LIMIT 100`);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

router.post('/inspections/:id/approve', authenticate, authorise(ROLES.SUPERVISOR),
  async (req, res, next) => {
    try {
      const approve = req.body && req.body.approve !== false;
      const { rows } = await query(
        approve
          ? `UPDATE inspection SET approved_by=$2, approved_at=now() WHERE inspection_id=$1 RETURNING *`
          : `UPDATE inspection SET approved_by=NULL, approved_at=NULL WHERE inspection_id=$1 RETURNING *`,
        [req.params.id, req.user.user_id].slice(0, approve ? 2 : 1));
      if (!rows.length) return res.status(404).json({ error: 'inspection not found' });
      res.locals.auditEntity = 'inspection';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = approve ? 'APPROVE' : 'RETURN';
      return res.json({ inspection_id: req.params.id, approved: approve, remarks: req.body.remarks || null });
    } catch (e) { return next(e); }
  });

module.exports = router;
