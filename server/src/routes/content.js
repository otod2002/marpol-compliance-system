'use strict';
/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 *
 * routes/content.js was missing from the uploaded bundle. This is a
 * first-pass implementation inferred from the reference_content and
 * language tables already in your schema (001_init.sql), written to match
 * the conventions used in intake.js. It is UNVERIFIED against your actual
 * requirements — review it, rename/extend fields as your report describes,
 * and treat it as a starting point rather than finished work.
 *
 * Assumed public surface, per SETUP.md's description of the portal's
 * "reference content" (Convention text, Annex summaries, guides, about
 * pages), served only where is_published = TRUE:
 *
 *   GET /api/content              list published items, optional filters
 *   GET /api/content/:id          a single published item
 */
const express = require('express');
const { query } = require('../db');

const router = express.Router();

/**
 * List published reference content.
 * Optional query params: content_type (CONVENTION|ANNEX|GUIDE|ABOUT),
 * language (ISO code stored on the `language` table — adjust column name
 * below if your `language` table uses a different one).
 */
router.get('/content', async (req, res, next) => {
  try {
    const { content_type, language } = req.query;
    const conditions = ['rc.is_published = TRUE'];
    const params = [];

    if (content_type) {
      params.push(content_type);
      conditions.push(`rc.content_type = $${params.length}`);
    }
    if (language) {
      params.push(language);
      conditions.push(`l.language_code = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT rc.content_id, rc.content_type, rc.annex_code, rc.title,
              rc.summary_text, rc.source_citation, rc.effective_date,
              rc.version, l.language_code, rc.updated_at
         FROM reference_content rc
         JOIN language l ON l.language_id = rc.language_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY rc.content_type, rc.title
        LIMIT 200`,
      params
    );
    return res.json(rows);
  } catch (e) { return next(e); }
});

/** A single published content item, including the full body text. */
router.get('/content/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT rc.content_id, rc.content_type, rc.annex_code, rc.title,
              rc.summary_text, rc.body_text, rc.source_citation,
              rc.effective_date, rc.version, l.language_code, rc.updated_at
         FROM reference_content rc
         JOIN language l ON l.language_id = rc.language_id
        WHERE rc.content_id = $1 AND rc.is_published = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'no published content with that id' });
    return res.json(rows[0]);
  } catch (e) { return next(e); }
});

module.exports = router;
