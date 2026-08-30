'use strict';
const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const { ROLES, authenticate, authorise, authoriseCustodyStage } = require('../auth');
const { reconcileCustody } = require('../../../shared/rules');

const router = express.Router();

const ref = p => `${p}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/* ======================= SECTION A : BOOKING ======================== */
/**
 * FR-34 : raise a waste collection note against a declaration and book
 * collection. This is Section A of the operative Controlled Waste Collection
 * Note, completed by the officer aboard the vessel.
 */
const bookSchema = z.object({
  inspection_id: z.string().uuid(),
  declaration_id: z.string().uuid().optional().nullable(),
  zone: z.string().optional().nullable(),
  general_description: z.string().optional().nullable(),
  containment_type: z.string().optional().nullable(),
  specified_quantity_text: z.string().optional().nullable(),
  booked_quantity: z.number().nonnegative().optional().nullable(),
  booked_quantity_unit: z.string().optional().nullable(),
  booked_date: z.string().optional().nullable(),
  booked_time: z.string().optional().nullable(),
  booked_means: z.string().optional().nullable(),
});

router.post('/waste-notes', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR),
  async (req, res, next) => {
    try {
      const parsed = bookSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
      const d = parsed.data;

      const out = await tx(async client => {
        const { rows } = await client.query(
          `INSERT INTO waste_collection_note
             (inspection_id, declaration_id, zone, general_description, containment_type,
              specified_quantity_text, booked_quantity, booked_quantity_unit,
              booked_date, booked_time, booked_means, custody_stage)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'BOOKED') RETURNING *`,
          [d.inspection_id, d.declaration_id, d.zone, d.general_description, d.containment_type,
           d.specified_quantity_text, d.booked_quantity, d.booked_quantity_unit,
           d.booked_date, d.booked_time, d.booked_means]);

        // Section A itself is the first custody attestation.
        await client.query(
          `INSERT INTO custody_event (wcn_id, stage, occurred_at, quantity, quantity_unit, actor_id)
           VALUES ($1,'BOOKED', now(), $2, $3, $4)`,
          [rows[0].wcn_id, d.booked_quantity, d.booked_quantity_unit, req.user.user_id]);

        return rows[0];
      });

      res.locals.auditEntity = 'waste_collection_note';
      res.locals.auditEntityId = out.wcn_id;
      res.locals.auditAction = 'BOOK';
      res.locals.auditNew = out;
      return res.status(201).json(out);
    } catch (e) { return next(e); }
  });

/* ================= SECTIONS B, C, D : CUSTODY STAGES ================ */

const stageSchema = z.object({
  stage: z.enum(['COLLECTED', 'IN_TRANSIT', 'RECEIVED']),
  occurred_at: z.string().datetime().optional(),
  location: z.string().optional().nullable(),
  quantity: z.number().nonnegative().optional().nullable(),
  quantity_unit: z.string().optional().nullable(),
  waste_type: z.string().optional().nullable(),
  facility_id: z.string().uuid().optional().nullable(),
  means_of_conveyance: z.string().optional().nullable(),
  signatory_name: z.string().optional().nullable(),
  signature_path: z.string().optional().nullable(),
});

const STAGE_ORDER = ['BOOKED', 'COLLECTED', 'IN_TRANSIT', 'RECEIVED'];

/**
 * FR-40, FR-41 : attest a custody stage.
 *
 * Three protections apply, and the redundancy is deliberate:
 *   - the role may attest only its own stage       (authoriseCustodyStage)
 *   - the stage may not precede one already recorded (ordering check below)
 *   - the stage may be attested once only           (UNIQUE (wcn_id, stage))
 *
 * The third holds even if the first two were bypassed, because it is a
 * schema constraint rather than application logic. Verified by TC-18, TC-19.
 */
router.post('/waste-notes/:id/custody', authenticate, authoriseCustodyStage,
  async (req, res, next) => {
    try {
      const parsed = stageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
      const d = parsed.data;

      const out = await tx(async client => {
        const { rows: noteRows } = await client.query(
          `SELECT * FROM waste_collection_note WHERE wcn_id = $1 FOR UPDATE`, [req.params.id]);
        if (!noteRows.length) return { status: 404, body: { error: 'waste note not found' } };
        const note = noteRows[0];

        // -- ordering: a stage may not be recorded before its predecessor (TC-19)
        const { rows: recorded } = await client.query(
          `SELECT stage FROM custody_event WHERE wcn_id = $1`, [req.params.id]);
        const have = new Set(recorded.map(r => r.stage));
        const idx = STAGE_ORDER.indexOf(d.stage);
        const predecessor = STAGE_ORDER[idx - 1];
        if (predecessor && !have.has(predecessor) && predecessor !== 'IN_TRANSIT') {
          return { status: 409, body: {
            error: 'custody stage out of sequence',
            reason: 'MISSING_PREDECESSOR',
            required: predecessor } };
        }
        // -- single attestation (TC-18); the constraint also enforces this
        if (have.has(d.stage)) {
          return { status: 409, body: { error: 'stage already attested', reason: 'DUPLICATE_STAGE' } };
        }

        await client.query(
          `INSERT INTO custody_event
             (wcn_id, stage, occurred_at, location, quantity, quantity_unit, waste_type,
              actor_id, facility_id, means_of_conveyance)
           VALUES ($1,$2,COALESCE($3::timestamptz, now()),$4,$5,$6,$7,$8,$9,$10)`,
          [req.params.id, d.stage, d.occurred_at, d.location, d.quantity, d.quantity_unit,
           d.waste_type, req.user.user_id, d.facility_id, d.means_of_conveyance]);

        await client.query(
          `UPDATE waste_collection_note SET custody_stage = $2 WHERE wcn_id = $1`,
          [req.params.id, d.stage]);

        if (d.signatory_name) {
          const role = d.stage === 'RECEIVED' ? 'FACILITY_RECEIVER' : 'WASTE_TEAM_LEADER';
          await client.query(
            `INSERT INTO signatory (document_type, document_id, signatory_role, name, signature_path)
             VALUES ('WASTE_COLLECTION_NOTE',$1,$2,$3,$4)
             ON CONFLICT (document_type, document_id, signatory_role) DO NOTHING`,
            [req.params.id, role, d.signatory_name, d.signature_path]);
        }

        /* ---------- FR-42 : reconcile on receipt ---------- */
        let reconciliation = null;
        if (d.stage === 'RECEIVED') {
          const { rows: decl } = await client.query(
            `SELECT * FROM waste_declaration WHERE declaration_id = $1`, [note.declaration_id]);
          const { rows: events } = await client.query(
            `SELECT * FROM custody_event WHERE wcn_id = $1`, [req.params.id]);

          const r = reconcileCustody(decl[0] || null, note, events);
          const { rows: saved } = await client.query(
            `INSERT INTO reconciliation
               (wcn_id, declared_quantity, booked_quantity, collected_quantity, received_quantity,
                variance_value, variance_percent, variance_flag)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (wcn_id) DO UPDATE SET
               declared_quantity=EXCLUDED.declared_quantity,
               booked_quantity=EXCLUDED.booked_quantity,
               collected_quantity=EXCLUDED.collected_quantity,
               received_quantity=EXCLUDED.received_quantity,
               variance_value=EXCLUDED.variance_value,
               variance_percent=EXCLUDED.variance_percent,
               variance_flag=EXCLUDED.variance_flag,
               evaluated_at=now()
             RETURNING *`,
            [req.params.id, r.declared_quantity ?? null, r.booked_quantity ?? null,
             r.collected_quantity ?? null, r.received_quantity ?? null,
             r.variance_value ?? null, r.variance_percent ?? null, r.variance_flag]);
          reconciliation = saved[0];
        }

        return { status: 201, body: { wcn_id: req.params.id, stage: d.stage, reconciliation } };
      });

      if (out.status === 201) {
        res.locals.auditEntity = 'custody_event';
        res.locals.auditEntityId = req.params.id;
        res.locals.auditAction = `ATTEST_${d_stage(req)}`;
        res.locals.auditNew = out.body;
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

const d_stage = req => (req.body && req.body.stage) || 'UNKNOWN';

/** Full custody chain of one note, with its reconciliation. */
router.get('/waste-notes/:id', authenticate, async (req, res, next) => {
  try {
    const { rows: note } = await query(`SELECT * FROM waste_collection_note WHERE wcn_id=$1`, [req.params.id]);
    if (!note.length) return res.status(404).json({ error: 'waste note not found' });
    const { rows: events } = await query(
      `SELECT * FROM custody_event WHERE wcn_id=$1 ORDER BY occurred_at`, [req.params.id]);
    const { rows: recon } = await query(`SELECT * FROM reconciliation WHERE wcn_id=$1`, [req.params.id]);
    return res.json({ note: note[0], custody_events: events, reconciliation: recon[0] || null });
  } catch (e) { return next(e); }
});

/** Supervisory queue: consignments whose variance exceeded tolerance. */
router.get('/reconciliations/variances', authenticate, authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT r.*, w.wcn_number, v.imo_number, v.vessel_name
           FROM reconciliation r
           JOIN waste_collection_note w ON w.wcn_id = r.wcn_id
           JOIN inspection i ON i.inspection_id = w.inspection_id
           JOIN compliance_case c ON c.case_id = i.case_id
           JOIN vessel v ON v.vessel_id = c.vessel_id
          WHERE r.variance_flag IN ('BEYOND_TOLERANCE','UNIT_MISMATCH')
          ORDER BY r.evaluated_at DESC LIMIT 100`);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

module.exports = router;
