#!/usr/bin/env node
'use strict';
/**
 * BOOTSTRAP THE FIRST ADMINISTRATOR.
 *
 * A system in which only an administrator may create accounts has no way to
 * create its first one. This script closes that circle, and it is deliberately
 * the ONLY pathway that does: it runs at the command line, against the
 * database, by someone who already holds database credentials.
 *
 * There is no HTTP endpoint that creates an administrator without
 * authentication, because such an endpoint would remain reachable after
 * bootstrap and would undo every other authorisation control in the system.
 *
 * Usage:
 *   node scripts/bootstrap-admin.js "Full Name" admin@example.gov.ng 'a-long-password'
 *
 * Refuses to run if an active administrator already exists, so it cannot be
 * used to quietly mint a second one later.
 */
require('dotenv').config();
const { query, pool } = require('../src/db');
const { hashPassword } = require('../src/auth');

async function main() {
  const [full_name, email, password] = process.argv.slice(2);

  if (!full_name || !email || !password) {
    console.error('Usage: node scripts/bootstrap-admin.js "Full Name" email password');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Refusing: the password must be at least 12 characters.');
    process.exit(1);
  }

  const { rows: existing } = await query(
    `SELECT u.email FROM app_user u JOIN role r ON r.role_id = u.role_id
      WHERE r.role_name = 'ADMINISTRATOR' AND u.is_active`);
  if (existing.length) {
    console.error(`Refusing: an active administrator already exists (${existing[0].email}).`);
    console.error('Create further accounts through the application, so the action is audited.');
    process.exit(1);
  }

  const { rows: role } = await query(`SELECT role_id FROM role WHERE role_name = 'ADMINISTRATOR'`);
  if (!role.length) {
    console.error('Refusing: the role table is empty. Load db/seed/01_vocabularies.sql first.');
    process.exit(1);
  }

  const { rows } = await query(
    `INSERT INTO app_user (role_id, full_name, email, password_hash)
     VALUES ($1,$2,$3,$4) RETURNING user_id`,
    [role[0].role_id, full_name, email, await hashPassword(password)]);

  // Even the bootstrap is audited. The first act of the system is recorded.
  await query(
    `INSERT INTO audit_log (user_id, entity_name, entity_id, action, new_value)
     VALUES ($1,'app_user',$2,'BOOTSTRAP_ADMIN',$3)`,
    [rows[0].user_id, rows[0].user_id,
     JSON.stringify({ email, role_name: 'ADMINISTRATOR' })]);

  console.log(`Administrator created: ${email}`);
  console.log('Sign in through the field application and create the remaining accounts there.');
  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
