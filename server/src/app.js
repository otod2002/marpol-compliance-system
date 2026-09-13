'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { auditMiddleware } = require('./audit');

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  // Supports one or more comma-separated origins, e.g.
  // "https://marpol-portal.onrender.com,https://marpol-field.onrender.com"
  // — needed once the portal and field app are deployed as two separate
  // sites, both calling this same server. Falls back to allowing any
  // origin (the previous behaviour) if CORS_ORIGIN is unset.
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : true;
  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: '10mb' }));   // bounded: evidence streams separately

  // NFR-09 : unauthenticated surfaces are rate limited per originating
  // address, so the request-reference space cannot be enumerated (TS-06).
  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 100,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'too many requests from this address' },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    skipSuccessfulRequests: true,
    message: { error: 'too many authentication attempts' },
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.use('/api/auth/login', authLimiter);
  app.use('/api/requests', publicLimiter);
  app.use('/api/content', publicLimiter);

  app.use(auditMiddleware);

  app.use('/api', require('./routes/intake'));
  app.use('/api', require('./routes/inspections'));
  app.use('/api', require('./routes/waste'));
  app.use('/api', require('./routes/content'));
  app.use('/api', require('./routes/cases'));
  app.use('/api', require('./routes/portal'));
  app.use('/api', require('./routes/reports'));
  app.use('/api', require('./routes/users'));
  app.use('/api', require('./routes/admin'));
  app.use('/api', require('./routes/delivery'));
  app.use('/api', require('./routes/enquiries'));

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Errors are logged in full server-side and reported opaquely to the
  // caller, so that internal structure is not disclosed.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
module.exports = { buildApp };
