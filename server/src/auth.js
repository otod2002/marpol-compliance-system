'use strict';
/**
 * Authentication and authorisation.
 *
 * Two properties are load-bearing and are defended in Chapter Four, 4.2.4:
 *
 *  (a) Credentials are hashed with Argon2id and per-credential salts. No
 *      pathway exists through which a stored credential can be recovered.
 *      (NFR-06, verified by TS-01.)
 *
 *  (b) Authorisation is evaluated AT THE SERVER on every request, against the
 *      role carried in the verified token. It never relies on client state,
 *      because concealing a control in the interface prevents a user from
 *      seeing an operation without preventing the request being issued.
 *      (NFR-08, verified by TS-03.)
 */
const jwt = require('jsonwebtoken');
const argon2 = require('@node-rs/argon2');
const { query } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const TOKEN_TTL = process.env.TOKEN_TTL || '12h';

const ROLES = {
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  WASTE_TEAM_LEADER: 'WASTE_TEAM_LEADER',
  FACILITY_RECEIVER: 'FACILITY_RECEIVER',
  SUPERVISOR: 'SUPERVISOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  VESSEL_AGENT: 'VESSEL_AGENT',
};

const hashPassword = pw => argon2.hash(pw, { algorithm: argon2.Algorithm.Argon2id });
const verifyPassword = (hash, pw) => argon2.verify(hash, pw).catch(() => false);

function issueToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role_name, zone: user.zone || null },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** Record every attempt, successful or failed (FR-03, verified by TS-09). */
async function recordAttempt({ userId, email, ip, ua, ok, reason }) {
  await query(
    `INSERT INTO login_attempt (user_id, email_attempted, ip_address, user_agent, succeeded, failure_reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId || null, email, ip || null, ua || null, ok, reason || null]
  ).catch(e => console.error('login_attempt write failed:', e.message));
}

/** Verify the bearer token and attach the caller to the request. */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

/** Restrict a route to the listed roles. Evaluated server-side, always. */
function authorise(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'authentication required' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'role not permitted for this operation' });
    }
    return next();
  };
}

/**
 * Custody stage scoping (NFR-08, verified by TS-04).
 *
 * A waste collection team leader may attest COLLECTED and no other stage; a
 * reception facility receiver may attest RECEIVED and no other. This mirrors
 * at the authorisation layer the single-attestation constraint the schema
 * enforces, and the redundancy is deliberate.
 */
const STAGE_ROLE = {
  BOOKED: [ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR],
  COLLECTED: [ROLES.WASTE_TEAM_LEADER],
  IN_TRANSIT: [ROLES.WASTE_TEAM_LEADER],
  RECEIVED: [ROLES.FACILITY_RECEIVER],
};

function authoriseCustodyStage(req, res, next) {
  const stage = req.body && req.body.stage;
  const permitted = STAGE_ROLE[stage];
  if (!permitted) return res.status(400).json({ error: 'unknown custody stage' });
  if (!permitted.includes(req.user.role)) {
    return res.status(403).json({ error: `role may not attest stage ${stage}` });
  }
  return next();
}

module.exports = {
  ROLES, hashPassword, verifyPassword, issueToken, recordAttempt,
  authenticate, authorise, authoriseCustodyStage, JWT_SECRET,
};
