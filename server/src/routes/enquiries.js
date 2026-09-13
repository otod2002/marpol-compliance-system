'use strict';
/**
 * ADDED — NOT IN YOUR ORIGINAL FILES. server/src/routes/portal.js already
 * accepts a public enquiry (POST /enquiries) and stores it correctly, but
 * nothing anywhere let a compliance officer or supervisor actually read
 * one afterward — the schema (enquiry_thread, enquiry_message) already
 * anticipated this, with sender_type distinguishing PUBLIC from OFFICER
 * messages, but no endpoint used that column at all. Confirmed by
 * checking, not assuming: there was no GET route for enquiries anywhere
 * in the server before this file.
 */
const express = require('express');
const { query } = require('../db');
const { ROLES, authenticate, authorise } = require('../auth');

const router = express.Router();

const STAFF = [ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR, ROLES.ADMINISTRATOR];

/** Every enquiry thread, most recently active first. */
router.get('/enquiries', authenticate, authorise(...STAFF), async (req, res, next) => {
  try {
    const status = (req.query.status || '').toUpperCase();
    const conditions = [];
    const params = [];
    if (status === 'OPEN' || status === 'CLOSED') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    const { rows } = await query(
      `SELECT t.thread_id, t.thread_reference, t.subject, t.category, t.vessel_imo,
              t.sender_name, t.sender_email, t.sender_phone, t.status, t.created_at, t.closed_at,
              u.full_name AS assigned_to_name,
              (SELECT count(*) FROM enquiry_message m WHERE m.thread_id = t.thread_id) AS message_count,
              (SELECT max(m.sent_at) FROM enquiry_message m WHERE m.thread_id = t.thread_id) AS last_message_at,
              EXISTS (
                SELECT 1 FROM enquiry_message m
                 WHERE m.thread_id = t.thread_id AND m.sender_type = 'PUBLIC' AND m.read_at IS NULL
              ) AS has_unread
         FROM enquiry_thread t
         LEFT JOIN app_user u ON u.user_id = t.assigned_to
         ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
        ORDER BY last_message_at DESC NULLS LAST, t.created_at DESC
        LIMIT 200`, params);
    return res.json(rows);
  } catch (e) { return next(e); }
});

/**
 * One thread's full message history, and — since opening a thread is the
 * natural moment an officer has actually seen it — every unread PUBLIC
 * message in it is marked read at the same time.
 */
router.get('/enquiries/:id', authenticate, authorise(...STAFF), async (req, res, next) => {
  try {
    const { rows: thread } = await query(
      `SELECT t.*, u.full_name AS assigned_to_name
         FROM enquiry_thread t LEFT JOIN app_user u ON u.user_id = t.assigned_to
        WHERE t.thread_id = $1`, [req.params.id]);
    if (!thread.length) return res.status(404).json({ error: 'enquiry not found' });

    await query(
      `UPDATE enquiry_message SET read_at = now()
        WHERE thread_id = $1 AND sender_type = 'PUBLIC' AND read_at IS NULL`, [req.params.id]);

    const { rows: messages } = await query(
      `SELECT message_id, sender_type, sender_name, body, sent_at, read_at
         FROM enquiry_message WHERE thread_id = $1 ORDER BY sent_at`, [req.params.id]);
    return res.json({ thread: thread[0], messages });
  } catch (e) { return next(e); }
});

/** A staff reply. Assigns the thread to the replying officer if unassigned. */
router.post('/enquiries/:id/reply', authenticate, authorise(...STAFF), async (req, res, next) => {
  try {
    const body = (req.body && req.body.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'a reply body is required' });

    const { rows: thread } = await query(
      `SELECT thread_id, assigned_to FROM enquiry_thread WHERE thread_id = $1`, [req.params.id]);
    if (!thread.length) return res.status(404).json({ error: 'enquiry not found' });

    // FIXED — req.user is just the decoded JWT payload (auth.js signs it
    // with only user_id, role, zone), so req.user.full_name was always
    // undefined here — confirmed by actually sending a reply and seeing
    // "—" render instead of a name. Looked up properly instead.
    const { rows: staff } = await query(`SELECT full_name FROM app_user WHERE user_id = $1`, [req.user.user_id]);
    const { rows: inserted } = await query(
      `INSERT INTO enquiry_message (thread_id, sender_type, sender_name, body)
       VALUES ($1, 'OFFICER', $2, $3) RETURNING message_id, sent_at`,
      [req.params.id, staff[0]?.full_name || null, body]);

    if (!thread[0].assigned_to) {
      await query(`UPDATE enquiry_thread SET assigned_to = $2 WHERE thread_id = $1`,
        [req.params.id, req.user.user_id]);
    }

    res.locals.auditEntity = 'enquiry_thread';
    res.locals.auditEntityId = req.params.id;
    res.locals.auditAction = 'REPLY';
    return res.status(201).json(inserted[0]);
  } catch (e) { return next(e); }
});

/** Close or reopen a thread. */
router.patch('/enquiries/:id', authenticate, authorise(...STAFF), async (req, res, next) => {
  try {
    const closing = req.body && req.body.status === 'CLOSED';
    const { rows } = await query(
      closing
        ? `UPDATE enquiry_thread SET status='CLOSED', closed_at=now() WHERE thread_id=$1 RETURNING thread_id, status`
        : `UPDATE enquiry_thread SET status='OPEN', closed_at=NULL WHERE thread_id=$1 RETURNING thread_id, status`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'enquiry not found' });
    res.locals.auditEntity = 'enquiry_thread';
    res.locals.auditEntityId = req.params.id;
    res.locals.auditAction = closing ? 'CLOSE' : 'REOPEN';
    return res.json(rows[0]);
  } catch (e) { return next(e); }
});

module.exports = router;
