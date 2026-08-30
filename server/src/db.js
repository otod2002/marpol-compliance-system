'use strict';
/**
 * Database connection pool.
 *
 * This file was not present in the uploaded server bundle. It is written to
 * satisfy the `{ query, tx }` interface every route and the audit module
 * import from `./db` — there is only one reasonable way to implement this,
 * so it carries no project-specific decisions.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // A background/idle client error should not crash the process.
  console.error('unexpected error on idle database client', err);
});

/** Run a single query against the pool. */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a function inside a single transaction. The function receives a
 * client whose .query() participates in that transaction; the transaction
 * commits if the function resolves, and rolls back if it throws.
 */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
