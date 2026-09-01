'use strict';
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { ROLES, hashPassword, authenticate, authorise } = require('../auth');

const router = express.Router();

/**
 * USER ADMINISTRATION  (FR-50, FR-02)
 *
 * Two properties are deliberate:
 *
 *  1. Only an ADMINISTRATOR may create, amend, or deactivate an account, and
 *     that is enforced at the server. A privilege system in which any
 *     authenticated user could mint a supervisor would make every other
 *     authorisation control decorative.
 *
 *  2. Accounts are DEACTIVATED, never deleted. A user identifier appears on
 *     inspections, custody attestations, and audit entries; deleting the row
 *     would orphan evidence. Deactivation withdraws access and leaves the
 *     record of who did what intact.
 */

const ROLE_NAMES = Object.values(ROLES);

const createSchema = z.object({
  full_name: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(12, 'A password of at least 12 characters is required'),
  role_name: z.enum(ROLE_NAMES),
  zone: z.string().max(60).optional().nullable(),
});

router.get('/roles', authenticate, authorise(ROLES.ADMINISTRATOR), async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT role_id, role_name FROM role ORDER BY role_name`);
    return res.json(rows);
  } catch (e) { return next(e); }
});

router.get('/users', authenticate, authorise(ROLES.ADMINISTRATOR), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, u.full_name, u.email, u.zone, u.is_active, u.created_at, r.role_name
         FROM app_user u JOIN role r ON r.role_id = u.role_id
        ORDER BY u.is_active DESC, r.role_name, u.full_name`);
    return res.json(rows);   // password_hash is never selected
  } catch (e) { return next(e); }
});

router.post('/users', authenticate, authorise(ROLES.ADMINISTRATOR), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
    }
    const d = parsed.data;

    const { rows: role } = await query(`SELECT role_id FROM role WHERE role_name = $1`, [d.role_name]);
    if (!role.length) return res.status(400).json({ error: 'unknown role' });

    const { rows: dup } = await query(`SELECT 1 FROM app_user WHERE lower(email) = lower($1)`, [d.email]);
    if (dup.length) return res.status(409).json({ error: 'an account already exists for that email' });

    const { rows } = await query(
      `INSERT INTO app_user (role_id, full_name, email, password_hash, zone)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING user_id, full_name, email, zone, is_active, created_at`,
      [role[0].role_id, d.full_name, d.email, await hashPassword(d.password), d.zone || null]);

    res.locals.auditEntity = 'app_user';
    res.locals.auditEntityId = rows[0].user_id;
    res.locals.auditAction = 'CREATE_USER';
    res.locals.auditNew = { email: d.email, role_name: d.role_name, zone: d.zone || null };
    return res.status(201).json({ ...rows[0], role_name: d.role_name });
  } catch (e) { return next(e); }
});

const patchSchema = z.object({
  role_name: z.enum(ROLE_NAMES).optional(),
  zone: z.string().max(60).optional().nullable(),
  is_active: z.boolean().optional(),
  password: z.string().min(12).optional(),
});

router.patch('/users/:id', authenticate, authorise(ROLES.ADMINISTRATOR), async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid payload', detail: parsed.error.issues });
    const d = parsed.data;

    // An administrator may not deactivate or demote their own account, which
    // would otherwise permit the last administrator to lock everyone out.
    if (req.params.id === req.user.user_id && (d.is_active === false || d.role_name)) {
      return res.status(409).json({
        error: 'an administrator cannot deactivate or change the role of their own account',
        reason: 'SELF_LOCKOUT',
      });
    }

    const sets = [], vals = [req.params.id];
    if (d.role_name) {
      const { rows: r } = await query(`SELECT role_id FROM role WHERE role_name = $1`, [d.role_name]);
      if (!r.length) return res.status(400).json({ error: 'unknown role' });
      vals.push(r[0].role_id); sets.push(`role_id = $${vals.length}`);
    }
    if (d.zone !== undefined) { vals.push(d.zone); sets.push(`zone = $${vals.length}`); }
    if (d.is_active !== undefined) { vals.push(d.is_active); sets.push(`is_active = $${vals.length}`); }
    if (d.password) { vals.push(await hashPassword(d.password)); sets.push(`password_hash = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nothing to change' });

    const { rows } = await query(
      `UPDATE app_user SET ${sets.join(', ')} WHERE user_id = $1
       RETURNING user_id, full_name, email, zone, is_active`, vals);
    if (!rows.length) return res.status(404).json({ error: 'user not found' });

    res.locals.auditEntity = 'app_user';
    res.locals.auditEntityId = req.params.id;
    res.locals.auditAction = d.is_active === false ? 'DEACTIVATE_USER'
      : d.password ? 'RESET_PASSWORD' : 'AMEND_USER';
    return res.json(rows[0]);
  } catch (e) { return next(e); }
});

module.exports = router;
