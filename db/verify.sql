-- =====================================================================
-- Verification script
--
-- Produces evidence for Chapter Five. Run after migration and seeding:
--     psql "$DATABASE_URL" -f db/verify.sql
--
-- Each query is labelled with the objective or requirement it evidences.
-- Screenshot the output of this script; it is legitimate empirical evidence
-- of the implemented data model.
-- =====================================================================

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 1  (Objective 2) : entity count of the implemented schema'
\echo '==================================================================='
SELECT count(*) AS implemented_entities
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 2  (Objective 2) : entities by subsystem'
\echo '==================================================================='
SELECT
  CASE
    WHEN table_name IN ('role','app_user','vessel','compliance_case','instrument_template',
                        'instrument_section','checklist_item','response_option','inspection',
                        'cargo_particulars','inspection_response','certificate',
                        'deficiency_code','action_code','deficiency','corrective_action')
      THEN 'A. Inspection'
    WHEN table_name IN ('waste_declaration','waste_collection_note','custody_event',
                        'reconciliation','facility','signatory','report','audit_log')
      THEN 'B. Waste custody and shared'
    ELSE 'C. Public portal'
  END AS subsystem,
  count(*) AS entities
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
GROUP BY 1 ORDER BY 1;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 3  (Objective 2) : instrument encoded, items by MARPOL Annex'
\echo '==================================================================='
SELECT
  COALESCE(s.annex_code, '(general)') AS annex,
  s.section_title,
  count(ci.item_id) AS items,
  sum(ci.weight)    AS total_weight
FROM instrument_section s
LEFT JOIN checklist_item ci ON ci.section_id = s.section_id
GROUP BY s.annex_code, s.section_title, s.display_order
ORDER BY s.display_order;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 4  (Objective 2) : the seven response types are all encoded'
\echo '==================================================================='
SELECT response_type, count(*) AS items
FROM checklist_item
GROUP BY response_type ORDER BY count(*) DESC;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 5  (FR-23, TC-06/TC-07) : vessel-type applicability rules'
\echo '   These are the rules that suppress inapplicable items automatically.'
\echo '==================================================================='
SELECT item_code, applicability_rule, left(requirement_text, 58) AS requirement
FROM checklist_item
WHERE applicability_rule IS NOT NULL
ORDER BY item_code;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 6  (FR-23) : item counts differ by vessel type'
\echo '   Demonstrates that the instrument presented is computed, not fixed.'
\echo '==================================================================='
SELECT 'General cargo, 8000 GRT' AS vessel,
       count(*) FILTER (WHERE applicability_rule IS NULL
                          OR applicability_rule @> '{"grt":{"gte":400}}') AS applicable_items
FROM checklist_item
UNION ALL
SELECT 'Oil tanker, 50000 GRT',
       count(*) FILTER (WHERE applicability_rule IS NULL
                          OR applicability_rule @> '{"grt":{"gte":400}}'
                          OR applicability_rule @> '{"vessel_type":["OIL_TANKER"]}')
FROM checklist_item;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 7  (Objective 3) : controlled vocabularies'
\echo '==================================================================='
SELECT 'deficiency codes' AS vocabulary, count(*) AS entries FROM deficiency_code
UNION ALL
SELECT 'action codes', count(*) FROM action_code
UNION ALL
SELECT 'action codes flagged detainable', count(*) FROM action_code WHERE is_detention;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 8  (NFR-11) : custody integrity enforced in the schema'
\echo '==================================================================='
SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('uq_custody_stage','ck_verified_pair','ck_report_subject');

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 9  (NFR-10, TS-05) : audit log privileges'
\echo '   Expect INSERT and SELECT only. No UPDATE. No DELETE.'
\echo '==================================================================='
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'audit_log' AND grantee = 'app_role'
ORDER BY privilege_type;

\echo ''
\echo '==================================================================='
\echo ' EVIDENCE 10 (NFR-12) : referential integrity is declared, not assumed'
\echo '==================================================================='
SELECT count(*) AS foreign_key_constraints
FROM pg_constraint WHERE contype = 'f';

\echo ''
\echo '=== end of verification ==='
\echo ''
