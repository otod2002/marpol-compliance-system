'use strict';
/**
 * DRAFT — NOT FROM YOUR ORIGINAL FILES.
 *
 * The PWA's WorkQueue screen (pwa-work-queue.png) shows compliance cases
 * awaiting an officer's attendance, but no server endpoint returning that
 * list existed in any uploaded zip. This is a first-pass implementation
 * built from the compliance_case/vessel/inspection_request tables already
 * in your schema — grounded in real columns, not invented ones, but
 * UNVERIFIED against whatever your report specifies for case assignment
 * (e.g. should this be filtered by the requesting officer's zone? right
 * now it returns every open, unattended case). Review before relying on it.
 */
const express = require('express');
const { query } = require('../db');
const { ROLES, authenticate, authorise } = require('../auth');

const router = express.Router();

/**
 * A case is "awaiting attendance" once triage has opened it but no
 * inspection has been recorded against it yet (inspection.case_id is
 * UNIQUE and 1:1 with compliance_case, so a LEFT JOIN that comes back
 * NULL means nobody has started one).
 */
router.get('/cases', authenticate,
  authorise(ROLES.COMPLIANCE_OFFICER, ROLES.SUPERVISOR, ROLES.ADMINISTRATOR),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT cc.case_id, cc.case_reference, cc.port, cc.berth, cc.notified_at,
                v.vessel_id, v.vessel_name, v.imo_number, v.vessel_type, v.grt,
                v.flag_state, v.is_nigerian_flag,
                ir.request_reference
           FROM compliance_case cc
           JOIN vessel v ON v.vessel_id = cc.vessel_id
           LEFT JOIN inspection_request ir ON ir.case_id = cc.case_id
           LEFT JOIN inspection i ON i.case_id = cc.case_id
          WHERE cc.case_status = 'OPEN' AND i.inspection_id IS NULL
          ORDER BY cc.notified_at ASC
          LIMIT 200`
      );
      return res.json(rows);
    } catch (e) { return next(e); }
  });

module.exports = router;
