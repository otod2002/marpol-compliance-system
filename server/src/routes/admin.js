'use strict';
const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const { ROLES, authenticate, authorise } = require('../auth');
const router = express.Router();

/* ============ FR-44 : CORRECTIVE ACTION VERIFICATION =============== */
/**
 * Closure requires an explicit verification act, recorded with the identity
 * of the verifier and the time. A deficiency does not close on the elapse of
 * its due date, because a deficiency that closed itself would report
 * remediation that nobody attested.
 */
router.get('/corrective-actions', authenticate,
  authorise(ROLES.SUPERVISOR, ROLES.ADMINISTRATOR), async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT ca.ca_id, ca.action_taken, ca.evidence_path, ca.assigned_to, ca.submitted_at,
                d.deficiency_id, d.status, d.raised_at, d.due_date,
                dc.code AS deficiency_code, dc.description AS deficiency_desc,
                ac.code AS action_code, ac.is_detention,
                ci.item_code, ci.requirement_text,
                i.mci_number, v.vessel_name, v.imo_number
           FROM corrective_action ca
           JOIN deficiency d  ON d.deficiency_id = ca.deficiency_id
           JOIN deficiency_code dc ON dc.code_id = d.code_id
           JOIN action_code ac ON ac.action_id = d.action_id
           JOIN inspection_response r ON r.response_id = d.response_id
           JOIN checklist_item ci ON ci.item_id = r.item_id
           JOIN inspection i ON i.inspection_id = d.inspection_id
           JOIN compliance_case c ON c.case_id = i.case_id
           JOIN vessel v ON v.vessel_id = c.vessel_id
          WHERE ca.verified_at IS NULL AND ca.submitted_at IS NOT NULL
          ORDER BY ac.is_detention DESC, ca.submitted_at ASC LIMIT 100`);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

router.post('/corrective-actions/:id/verify', authenticate,
  authorise(ROLES.SUPERVISOR), async (req, res, next) => {
    try {
      const accept = req.body?.accept !== false;
      const note = (req.body?.outcome || '').trim() || (accept ? 'Verified as rectified' : 'Not accepted');
      const out = await tx(async client => {
        const { rows: ca } = await client.query(
          `UPDATE corrective_action SET verified_by=$2, verified_at=now(), outcome=$3
            WHERE ca_id=$1 AND verified_at IS NULL RETURNING deficiency_id`,
          [req.params.id, req.user.user_id, note]);
        if (!ca.length) return { status: 409, body: { error: 'already verified, or not found' } };

        const { rows: d } = await client.query(
          `UPDATE deficiency SET status=$2, closed_at=$3 WHERE deficiency_id=$1 RETURNING deficiency_id, status`,
          [ca[0].deficiency_id, accept ? 'CLOSED' : 'OPEN', accept ? new Date() : null]);
        return { status: 200, body: { ...d[0], outcome: note, accepted: accept } };
      });
      if (out.status === 200) {
        res.locals.auditEntity = 'corrective_action';
        res.locals.auditEntityId = req.params.id;
        res.locals.auditAction = accept ? 'VERIFY_CLOSURE' : 'REJECT_CLOSURE';
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

/* ========== FR-48 : INSTRUMENT AND VOCABULARY ADMINISTRATION ======== */
/**
 * The regime is DATA. An amended requirement, weight, applicability rule or
 * code is an administrative act, never a redeployment (NFR-17). Templates
 * are versioned rather than edited in place, so an inspection captured
 * against version 1 remains interpretable after version 2 is published.
 */
router.get('/admin/instruments', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (_req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT t.*, count(DISTINCT s.section_id) AS sections, count(ci.item_id) AS items
           FROM instrument_template t
           LEFT JOIN instrument_section s ON s.template_id = t.template_id
           LEFT JOIN checklist_item ci ON ci.section_id = s.section_id
          GROUP BY t.template_id ORDER BY t.form_reference, t.version DESC`);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

router.get('/admin/instruments/:id/items', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT ci.*, s.annex_code, s.section_title, s.display_order AS section_order
           FROM checklist_item ci JOIN instrument_section s ON s.section_id = ci.section_id
          WHERE s.template_id = $1 ORDER BY s.display_order, ci.display_order`, [req.params.id]);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

const itemPatch = z.object({
  requirement_text: z.string().min(3).optional(),
  convention_reference: z.string().optional().nullable(),
  weight: z.number().min(0).max(100).optional(),
  applicability_rule: z.any().optional().nullable(),
});

router.patch('/admin/items/:id', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const p = itemPatch.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: 'invalid payload', detail: p.error.issues });

      // An item belonging to an ACTIVE template cannot be amended in place;
      // doing so would change the meaning of inspections already captured
      // against it. Publish a new version instead.
      const { rows: act } = await query(
        `SELECT t.is_active, t.version FROM checklist_item ci
           JOIN instrument_section s ON s.section_id = ci.section_id
           JOIN instrument_template t ON t.template_id = s.template_id
          WHERE ci.item_id = $1`, [req.params.id]);
      if (!act.length) return res.status(404).json({ error: 'item not found' });
      if (act[0].is_active) {
        return res.status(409).json({
          error: 'this item belongs to the active instrument version',
          reason: 'ACTIVE_TEMPLATE',
          note: 'Publish a new version and amend that, so inspections already captured remain interpretable.',
        });
      }

      const d = p.data, sets = [], vals = [req.params.id];
      for (const k of ['requirement_text', 'convention_reference', 'weight']) {
        if (d[k] !== undefined) { vals.push(d[k]); sets.push(`${k} = $${vals.length}`); }
      }
      if (d.applicability_rule !== undefined) {
        vals.push(d.applicability_rule ? JSON.stringify(d.applicability_rule) : null);
        sets.push(`applicability_rule = $${vals.length}`);
      }
      if (!sets.length) return res.status(400).json({ error: 'nothing to change' });

      const { rows } = await query(
        `UPDATE checklist_item SET ${sets.join(', ')} WHERE item_id = $1 RETURNING *`, vals);
      res.locals.auditEntity = 'checklist_item';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = 'AMEND_ITEM';
      return res.json(rows[0]);
    } catch (e) { return next(e); }
  });

/** Publish a new version by cloning the active one. Nothing is edited in place. */
router.post('/admin/instruments/:id/new-version', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const out = await tx(async client => {
        const { rows: t } = await client.query(
          `SELECT * FROM instrument_template WHERE template_id=$1`, [req.params.id]);
        if (!t.length) return { status: 404, body: { error: 'template not found' } };

        const { rows: nt } = await client.query(
          `INSERT INTO instrument_template (form_reference, instrument_type, version, effective_date, is_active)
           VALUES ($1,$2,(SELECT COALESCE(max(version),0)+1 FROM instrument_template WHERE form_reference=$1),
                   CURRENT_DATE, FALSE) RETURNING *`,
          [t[0].form_reference, t[0].instrument_type]);

        const { rows: secs } = await client.query(
          `SELECT * FROM instrument_section WHERE template_id=$1 ORDER BY display_order`, [req.params.id]);
        for (const s of secs) {
          const { rows: ns } = await client.query(
            `INSERT INTO instrument_section (template_id, annex_code, section_title, display_order)
             VALUES ($1,$2,$3,$4) RETURNING section_id`,
            [nt[0].template_id, s.annex_code, s.section_title, s.display_order]);
          const { rows: items } = await client.query(
            `SELECT * FROM checklist_item WHERE section_id=$1 ORDER BY display_order`, [s.section_id]);
          for (const it of items) {
            const { rows: ni } = await client.query(
              `INSERT INTO checklist_item
                 (section_id, item_code, requirement_text, convention_reference, response_type,
                  unit, applicability_rule, weight, display_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING item_id`,
              [ns[0].section_id, it.item_code, it.requirement_text, it.convention_reference,
               it.response_type, it.unit, it.applicability_rule, it.weight, it.display_order]);
            const { rows: opts } = await client.query(
              `SELECT * FROM response_option WHERE item_id=$1 ORDER BY option_order`, [it.item_id]);
            for (const o of opts) {
              await client.query(
                `INSERT INTO response_option (item_id, option_label, option_order) VALUES ($1,$2,$3)`,
                [ni[0].item_id, o.option_label, o.option_order]);
            }
          }
        }
        return { status: 201, body: nt[0] };
      });
      if (out.status === 201) {
        res.locals.auditEntity = 'instrument_template';
        res.locals.auditEntityId = out.body.template_id;
        res.locals.auditAction = 'NEW_VERSION';
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

/** Activation is exclusive: exactly one version of a form is active. */
router.post('/admin/instruments/:id/activate', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const out = await tx(async client => {
        const { rows: t } = await client.query(
          `SELECT form_reference FROM instrument_template WHERE template_id=$1`, [req.params.id]);
        if (!t.length) return { status: 404, body: { error: 'template not found' } };
        await client.query(
          `UPDATE instrument_template SET is_active=FALSE WHERE form_reference=$1`, [t[0].form_reference]);
        const { rows } = await client.query(
          `UPDATE instrument_template SET is_active=TRUE WHERE template_id=$1 RETURNING *`, [req.params.id]);
        return { status: 200, body: rows[0] };
      });
      res.locals.auditEntity = 'instrument_template';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = 'ACTIVATE_VERSION';
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

/* --------------------------- vocabularies -------------------------- */
router.get('/admin/codes', authenticate, authorise(ROLES.ADMINISTRATOR), async (_req, res, next) => {
  try {
    const [d, a] = await Promise.all([
      query(`SELECT * FROM deficiency_code ORDER BY code`),
      query(`SELECT * FROM action_code ORDER BY code`),
    ]);
    return res.json({ deficiency_codes: d.rows, action_codes: a.rows });
  } catch (e) { return next(e); }
});

router.post('/admin/codes/deficiency', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const s = z.object({ code: z.string().min(1).max(20), annex_code: z.string().max(5).optional().nullable(),
        category: z.string().max(60).optional().nullable(), description: z.string().min(3) }).safeParse(req.body);
      if (!s.success) return res.status(400).json({ error: 'invalid payload', detail: s.error.issues });
      const { rows } = await query(
        `INSERT INTO deficiency_code (code, annex_code, category, description)
         VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING RETURNING *`,
        [s.data.code, s.data.annex_code || null, s.data.category || null, s.data.description]);
      if (!rows.length) return res.status(409).json({ error: 'that code already exists' });
      res.locals.auditEntity = 'deficiency_code';
      res.locals.auditEntityId = rows[0].code_id;
      res.locals.auditAction = 'CREATE_CODE';
      return res.status(201).json(rows[0]);
    } catch (e) { return next(e); }
  });

/* =========== FR-49 : REFERENCE CONTENT AND TRANSLATIONS ============ */
router.get('/admin/content', authenticate, authorise(ROLES.ADMINISTRATOR), async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*, l.language_code FROM reference_content c
         JOIN language l ON l.language_id = c.language_id
        ORDER BY c.content_type, c.annex_code NULLS FIRST, l.language_code`);
    return res.json(rows);
  } catch (e) { return next(e); }
});

router.patch('/admin/content/:id', authenticate, authorise(ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const s = z.object({ title: z.string().optional(), summary_text: z.string().optional().nullable(),
        body_text: z.string().optional().nullable(), source_citation: z.string().optional().nullable(),
        is_published: z.boolean().optional() }).safeParse(req.body);
      if (!s.success) return res.status(400).json({ error: 'invalid payload' });
      const d = s.data, sets = [], vals = [req.params.id];
      for (const k of ['title', 'summary_text', 'body_text', 'source_citation', 'is_published']) {
        if (d[k] !== undefined) { vals.push(d[k]); sets.push(`${k} = $${vals.length}`); }
      }
      if (!sets.length) return res.status(400).json({ error: 'nothing to change' });
      vals.push(req.user.user_id);
      const { rows } = await query(
        `UPDATE reference_content SET ${sets.join(', ')}, updated_at = now(),
                updated_by = $${vals.length} WHERE content_id = $1 RETURNING *`, vals);
      if (!rows.length) return res.status(404).json({ error: 'content not found' });
      res.locals.auditEntity = 'reference_content';
      res.locals.auditEntityId = req.params.id;
      res.locals.auditAction = 'AMEND_CONTENT';
      return res.json(rows[0]);
    } catch (e) { return next(e); }
  });

module.exports = router;
