'use strict';
const express = require('express');
const { z } = require('zod');
const { query, tx } = require('../db');
const {
  ROLES, verifyPassword, issueToken, recordAttempt,
  authenticate, authorise,
} = require('../auth');

const router = express.Router();

/* ============================ AUTHENTICATION ======================== */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload' });
    const { email, password } = parsed.data;
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    const { rows } = await query(
      `SELECT u.user_id, u.full_name, u.password_hash, u.zone, u.is_active, r.role_name
         FROM app_user u JOIN role r ON r.role_id = u.role_id
        WHERE lower(u.email) = lower($1)`, [email]);

    const user = rows[0];
    // Uniform failure message: the response does not disclose whether the
    // account exists, which would otherwise permit account enumeration.
    if (!user || !user.is_active) {
      await recordAttempt({ email, ip, ua, ok: false, reason: 'unknown or inactive account' });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      await recordAttempt({ userId: user.user_id, email, ip, ua, ok: false, reason: 'bad password' });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    await recordAttempt({ userId: user.user_id, email, ip, ua, ok: true });
    return res.json({
      token: issueToken(user),
      user: { user_id: user.user_id, full_name: user.full_name, role: user.role_name, zone: user.zone },
    });
  } catch (e) { return next(e); }
});

router.get('/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

/* ======================= PORTAL : SERVICE REQUESTS ================== */

const requestSchema = z.object({
  vessel_imo: z.string().min(3).max(20),
  vessel_name: z.string().max(200).optional(),
  flag_state: z.string().max(100).optional(),
  vessel_type: z.string().max(60).optional(),
  gross_tonnage: z.number().nonnegative().optional(),
  agent_name: z.string().max(200).optional(),
  agent_email: z.string().email().optional(),
  agent_phone: z.string().max(40).optional(),
  port: z.string().max(120).optional(),
  berth: z.string().max(120).optional(),
  eta: z.string().datetime().optional(),
  etd: z.string().datetime().optional(),
  preferred_date: z.string().optional(),
  preferred_time_window: z.string().max(60).optional(),
  has_waste_to_land: z.boolean().default(false),
  channel: z.enum(['PORTAL', 'TELEPHONE', 'BERTH_ARRIVAL']).default('PORTAL'),
});

const ref = prefix =>
  `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** FR-04 : lodge a request. Unauthenticated; this is the public intake. */
router.post('/requests', async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
    }
    const d = parsed.data;

    // A request lodged by telephone or on berth arrival is recorded through
    // this same intake, so that the channel is an attribute of the request
    // rather than a separate pathway (Chapter Three, 3.5.2).
    if (d.channel !== 'PORTAL' && !(req.user && req.user.role === ROLES.COMPLIANCE_OFFICER)) {
      return res.status(403).json({ error: 'only an officer may record a non-portal channel' });
    }

    const { rows } = await query(
      `INSERT INTO inspection_request
         (request_reference, vessel_imo, vessel_name, flag_state, vessel_type, gross_tonnage,
          agent_name, agent_email, agent_phone, port, berth, eta, etd,
          preferred_date, preferred_time_window, has_waste_to_land, channel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING request_id, request_reference, status, submitted_at`,
      [ref('REQ'), d.vessel_imo, d.vessel_name, d.flag_state, d.vessel_type, d.gross_tonnage,
       d.agent_name, d.agent_email, d.agent_phone, d.port, d.berth, d.eta, d.etd,
       d.preferred_date, d.preferred_time_window, d.has_waste_to_land, d.channel]);

    res.locals.auditEntity = 'inspection_request';
    res.locals.auditEntityId = rows[0].request_id;
    res.locals.auditAction = 'CREATE';
    res.locals.auditNew = rows[0];
    return res.status(201).json(rows[0]);
  } catch (e) { return next(e); }
});

/**
 * FR-08 : track a request by reference, without an account.
 * TS-07 : discloses only the status of the referenced request and no other
 * record. Note the deliberately narrow SELECT list.
 */
router.get('/requests/:reference', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT request_reference, vessel_name, port, status, submitted_at,
              CASE WHEN case_id IS NOT NULL THEN TRUE ELSE FALSE END AS converted
         FROM inspection_request WHERE request_reference = $1`, [req.params.reference]);
    if (!rows.length) return res.status(404).json({ error: 'no request with that reference' });
    return res.json(rows[0]);
  } catch (e) { return next(e); }
});

/** Officer work queue. */
router.get('/requests', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const status = req.query.status || 'SUBMITTED';
      const { rows } = await query(
        `SELECT * FROM inspection_request WHERE status = $1 ORDER BY submitted_at ASC LIMIT 200`,
        [status]);
      return res.json(rows);
    } catch (e) { return next(e); }
  });

/**
 * FR-07 : triage a request into a compliance case.
 *
 * Triage is an explicit officer action, never an automatic conversion on
 * submission. That preserves the discretion to decline, and prevents a
 * malformed submission from opening a case that must then be reversed.
 *
 * TC-04 : a second conversion is rejected. Enforced by the partial unique
 * index on inspection_request.case_id as well as by the check below, so the
 * invariant does not depend on this code path being the only one.
 */
router.post('/requests/:id/triage', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR),
  async (req, res, next) => {
    try {
      const out = await tx(async client => {
        const { rows: reqRows } = await client.query(
          `SELECT * FROM inspection_request WHERE request_id = $1 FOR UPDATE`, [req.params.id]);
        const request = reqRows[0];
        if (!request) return { status: 404, body: { error: 'request not found' } };
        if (request.case_id) {
          return { status: 409, body: { error: 'request already converted', case_id: request.case_id } };
        }

        // Reconcile the lodged particulars against the vessel register.
        // A request may name a vessel the system has never inspected, which
        // is why inspection_request carries its own particulars.
        const { rows: vRows } = await client.query(
          `INSERT INTO vessel (imo_number, vessel_name, flag_state, vessel_type, grt, is_nigerian_flag)
           VALUES ($1,$2,$3,COALESCE($4,'UNKNOWN'),$5,$6)
           ON CONFLICT (imo_number) DO UPDATE SET vessel_name = COALESCE(EXCLUDED.vessel_name, vessel.vessel_name)
           RETURNING vessel_id`,
          [request.vessel_imo, request.vessel_name, request.flag_state, request.vessel_type,
           request.gross_tonnage, (request.flag_state || '').toUpperCase() === 'NIGERIA']);

        const { rows: cRows } = await client.query(
          `INSERT INTO compliance_case
             (case_reference, vessel_id, notification_channel, notified_at, port, berth, opened_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [ref('CASE'), vRows[0].vessel_id, request.channel, request.submitted_at,
           request.port, request.berth, req.user.user_id]);

        await client.query(
          `UPDATE inspection_request SET case_id = $1, status = 'CONVERTED', assigned_officer_id = $2
            WHERE request_id = $3`,
          [cRows[0].case_id, req.user.user_id, request.request_id]);

        return { status: 201, body: cRows[0] };
      });

      if (out.status === 201) {
        res.locals.auditEntity = 'compliance_case';
        res.locals.auditEntityId = out.body.case_id;
        res.locals.auditAction = 'TRIAGE';
        res.locals.auditNew = out.body;
      }
      return res.status(out.status).json(out.body);
    } catch (e) { return next(e); }
  });

module.exports = router;
