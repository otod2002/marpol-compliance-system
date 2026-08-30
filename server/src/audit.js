'use strict';
const { query } = require('./db');

/**
 * Append an audit entry (NFR-10).
 *
 * Immutability is enforced by database privilege: the application role holds
 * INSERT and SELECT on audit_log and no UPDATE or DELETE grant exists to be
 * misused. This function therefore only ever inserts. Verified by TS-05.
 */
async function writeAudit({ userId, entity, entityId, action, oldValue, newValue }, client) {
  const q = client ? client.query.bind(client) : query;
  await q(
    `INSERT INTO audit_log (user_id, entity_name, entity_id, action, old_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId || null, entity, String(entityId), action,
     oldValue ? JSON.stringify(oldValue) : null,
     newValue ? JSON.stringify(newValue) : null]
  );
}

/**
 * Middleware that audits any state-altering request after it succeeds.
 * Placed in the pipeline rather than in individual handlers, so that no
 * route can omit an entry through oversight (Chapter Four, 4.2.11).
 */
function auditMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const entity = res.locals.auditEntity;
    if (!entity) return;
    writeAudit({
      userId: req.user ? req.user.user_id : null,
      entity,
      entityId: res.locals.auditEntityId,
      action: res.locals.auditAction || req.method,
      oldValue: res.locals.auditOld,
      newValue: res.locals.auditNew,
    }).catch(err => console.error('audit write failed:', err.message));
  });
  next();
}

module.exports = { writeAudit, auditMiddleware };
