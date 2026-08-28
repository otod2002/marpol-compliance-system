-- =====================================================================
-- Seed 02 : encoding of the Vessel MARPOL Compliance Inspection Report
--           (form reference NIMASA/MCR/2023) as instrument data.
--
-- This is the artefact on which Objective 2 is assessed. Each entry on the
-- operative form is decomposed into the smallest unit admitting a single
-- determinate observation, typed according to the response the form elicits,
-- and carries a convention reference so that any determination the system
-- produces is traceable to its legal source (Chapter Three, Section 3.2.1).
--
-- >>> VERIFICATION REQUIRED BEFORE SUBMISSION <<<
-- This encoding reproduces the structure of the form as analysed. Every item
-- MUST be checked line by line against the source document, and any item the
-- form contains but this seed omits MUST be added, before the seed is relied
-- upon as a faithful digitisation. Documentary cross-check is the first
-- validation stage specified in Section 3.2.2.
-- =====================================================================

BEGIN;

INSERT INTO instrument_template (template_id, form_reference, instrument_type, version, effective_date, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'NIMASA/MCR/2023', 'MCI', 1, '2023-01-01', TRUE);

INSERT INTO instrument_section (section_id, template_id, annex_code, section_title, display_order) VALUES
 ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', NULL, 'Vessel Particulars',                 1),
 ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111', NULL, 'Cargo Particulars',                  2),
 ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111', 'I',  'Annex I  - Oil',                     3),
 ('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111', 'II', 'Annex II - Noxious Liquid Substances',4),
 ('22222222-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111', 'III','Annex III - Harmful Substances',      5),
 ('22222222-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111', 'IV', 'Annex IV - Sewage',                   6),
 ('22222222-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111', 'V',  'Annex V  - Garbage',                  7),
 ('22222222-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111', 'VI', 'Annex VI - Air Pollution',            8),
 ('22222222-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111', NULL, 'General Condition and Remarks',       9);

-- Applicability rule vocabulary used below:
--   {"vessel_type": ["OIL_TANKER"]}                    tankers only
--   {"vessel_type": ["OIL_TANKER","CHEMICAL_TANKER"]}  tankers carrying NLS
--   {"grt": {"gte": 400}}                              tonnage threshold
--   NULL                                               always applicable

-- ------------------------- ANNEX I -----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000003','I-01','International Oil Pollution Prevention (IOPP) Certificate sighted and valid','MARPOL Annex I, Reg. 7','CERTIFICATE',NULL,'{"grt":{"gte":400}}',3,1),
 ('22222222-0000-0000-0000-000000000003','I-02','Shipboard Oil Pollution Emergency Plan (SOPEP) available and approved','MARPOL Annex I, Reg. 37','TERNARY',NULL,'{"grt":{"gte":400}}',2,2),
 ('22222222-0000-0000-0000-000000000003','I-03','Oil Record Book Part I sighted and correctly maintained','MARPOL Annex I, Reg. 17','TERNARY',NULL,'{"grt":{"gte":400}}',3,3),
 ('22222222-0000-0000-0000-000000000003','I-04','Date of last entry in Oil Record Book Part I','MARPOL Annex I, Reg. 17','DATE',NULL,'{"grt":{"gte":400}}',1,4),
 ('22222222-0000-0000-0000-000000000003','I-05','Oil Record Book Part II sighted and correctly maintained','MARPOL Annex I, Reg. 36','TERNARY',NULL,'{"vessel_type":["OIL_TANKER"]}',3,5),
 ('22222222-0000-0000-0000-000000000003','I-06','Oily water separating equipment operational','MARPOL Annex I, Reg. 14','TERNARY',NULL,'{"grt":{"gte":400}}',3,6),
 ('22222222-0000-0000-0000-000000000003','I-07','15 ppm alarm arrangement operational','MARPOL Annex I, Reg. 14','TERNARY',NULL,'{"grt":{"gte":400}}',3,7),
 ('22222222-0000-0000-0000-000000000003','I-08','Quantity of bilge, sludge and slops retained on board','MARPOL Annex I, Reg. 12','NUMERIC_UNIT','CBM',NULL,1,8),
 ('22222222-0000-0000-0000-000000000003','I-09','Date tanks last pumped or discharged ashore','MARPOL Annex I, Reg. 12','DATE',NULL,NULL,1,9),
 ('22222222-0000-0000-0000-000000000003','I-10','Oily waste to be landed at this port','MARPOL Annex I, Reg. 38','TERNARY',NULL,NULL,2,10),
 ('22222222-0000-0000-0000-000000000003','I-11','Quantity of oily waste to be landed','MARPOL Annex I, Reg. 38','NUMERIC_UNIT','CBM',NULL,1,11),
 ('22222222-0000-0000-0000-000000000003','I-12','Slops to be landed at this port','MARPOL Annex I, Reg. 38','TERNARY',NULL,'{"vessel_type":["OIL_TANKER"]}',2,12),
 ('22222222-0000-0000-0000-000000000003','I-13','Quantity of slops to be landed','MARPOL Annex I, Reg. 38','NUMERIC_UNIT','CBM','{"vessel_type":["OIL_TANKER"]}',1,13),
 ('22222222-0000-0000-0000-000000000003','I-14','Vessel taking bunkers during this port call','MARPOL Annex I, Reg. 4','TERNARY',NULL,NULL,1,14),
 ('22222222-0000-0000-0000-000000000003','I-15','Scupper plugs and save-alls in place where bunkering or oil transfer occurs','MARPOL Annex I, Reg. 4','TERNARY',NULL,NULL,2,15);

-- ------------------------- ANNEX II ----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000004','II-01','Certificate of Fitness or NLS Certificate sighted and valid','MARPOL Annex II, Reg. 9','CERTIFICATE',NULL,'{"vessel_type":["CHEMICAL_TANKER","NLS_TANKER"]}',3,1),
 ('22222222-0000-0000-0000-000000000004','II-02','Cargo Record Book sighted and correctly maintained','MARPOL Annex II, Reg. 15','TERNARY',NULL,'{"vessel_type":["CHEMICAL_TANKER","NLS_TANKER"]}',3,2),
 ('22222222-0000-0000-0000-000000000004','II-03','Procedures and Arrangements Manual available and approved','MARPOL Annex II, Reg. 14','TERNARY',NULL,'{"vessel_type":["CHEMICAL_TANKER","NLS_TANKER"]}',2,3),
 ('22222222-0000-0000-0000-000000000004','II-04','Noxious liquid residues to be landed at this port','MARPOL Annex II, Reg. 18','TERNARY',NULL,'{"vessel_type":["CHEMICAL_TANKER","NLS_TANKER"]}',2,4),
 ('22222222-0000-0000-0000-000000000004','II-05','Quantity of noxious liquid residues to be landed','MARPOL Annex II, Reg. 18','NUMERIC_UNIT','CBM','{"vessel_type":["CHEMICAL_TANKER","NLS_TANKER"]}',1,5);

-- ------------------------- ANNEX III ---------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000005','III-01','Harmful substances location listing or stowage plan sighted','MARPOL Annex III, Reg. 4','TERNARY',NULL,NULL,2,1),
 ('22222222-0000-0000-0000-000000000005','III-02','Packaged harmful substances correctly marked and labelled','MARPOL Annex III, Reg. 2','TERNARY',NULL,NULL,2,2),
 ('22222222-0000-0000-0000-000000000005','III-03','Details of any harmful substances to be landed','MARPOL Annex III, Reg. 4','FREE_TEXT',NULL,NULL,1,3);

-- ------------------------- ANNEX IV ----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000006','IV-01','International Sewage Pollution Prevention (ISPP) Certificate sighted and valid','MARPOL Annex IV, Reg. 5','CERTIFICATE',NULL,'{"grt":{"gte":400}}',3,1),
 ('22222222-0000-0000-0000-000000000006','IV-02','Sewage treatment plant operational and type-approved','MARPOL Annex IV, Reg. 9','TERNARY',NULL,'{"grt":{"gte":400}}',3,2),
 ('22222222-0000-0000-0000-000000000006','IV-03','Sewage holding tank and standard discharge connection in order','MARPOL Annex IV, Reg. 10','TERNARY',NULL,NULL,2,3),
 ('22222222-0000-0000-0000-000000000006','IV-04','Sewage to be landed at this port','MARPOL Annex IV, Reg. 12','TERNARY',NULL,NULL,2,4),
 ('22222222-0000-0000-0000-000000000006','IV-05','Quantity of sewage to be landed','MARPOL Annex IV, Reg. 12','NUMERIC_UNIT','CBM',NULL,1,5);

-- ------------------------- ANNEX V -----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000007','V-01','Garbage Management Plan available and vessel-specific','MARPOL Annex V, Reg. 10','TERNARY',NULL,NULL,3,1),
 ('22222222-0000-0000-0000-000000000007','V-02','Garbage Record Book sighted and correctly maintained','MARPOL Annex V, Reg. 10','TERNARY',NULL,NULL,3,2),
 ('22222222-0000-0000-0000-000000000007','V-03','Date of last entry in Garbage Record Book','MARPOL Annex V, Reg. 10','DATE',NULL,NULL,1,3),
 ('22222222-0000-0000-0000-000000000007','V-04','Garbage placards displayed in required locations','MARPOL Annex V, Reg. 10','TERNARY',NULL,NULL,1,4),
 ('22222222-0000-0000-0000-000000000007','V-05','Manner in which garbage is contained on board','MARPOL Annex V, Reg. 10','SINGLE_SELECT',NULL,NULL,2,5),
 ('22222222-0000-0000-0000-000000000007','V-06','Categories of garbage held on board for landing','MARPOL Annex V, Reg. 10','MULTI_SELECT',NULL,NULL,2,6),
 ('22222222-0000-0000-0000-000000000007','V-07','Garbage to be landed at this port','MARPOL Annex V, Reg. 8','TERNARY',NULL,NULL,2,7),
 ('22222222-0000-0000-0000-000000000007','V-08','Quantity of garbage to be landed','MARPOL Annex V, Reg. 8','NUMERIC_UNIT','CBM',NULL,1,8);

-- ------------------------- ANNEX VI ----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000008','VI-01','International Air Pollution Prevention (IAPP) Certificate sighted and valid','MARPOL Annex VI, Reg. 6','CERTIFICATE',NULL,'{"grt":{"gte":400}}',3,1),
 ('22222222-0000-0000-0000-000000000008','VI-02','Ozone-Depleting Substances Record Book maintained where applicable','MARPOL Annex VI, Reg. 12','TERNARY',NULL,NULL,2,2),
 ('22222222-0000-0000-0000-000000000008','VI-03','Bunker delivery notes retained for the required period','MARPOL Annex VI, Reg. 18','TERNARY',NULL,NULL,2,3),
 ('22222222-0000-0000-0000-000000000008','VI-04','Representative fuel oil samples retained','MARPOL Annex VI, Reg. 18','TERNARY',NULL,NULL,2,4),
 ('22222222-0000-0000-0000-000000000008','VI-05','Incinerator operated in accordance with Annex VI where fitted','MARPOL Annex VI, Reg. 16','TERNARY',NULL,NULL,2,5),
 ('22222222-0000-0000-0000-000000000008','VI-06','Ozone-depleting substances or exhaust residues to be landed','MARPOL Annex VI, Reg. 17','TERNARY',NULL,NULL,1,6);

-- ------------------------- GENERAL -----------------------------------
INSERT INTO checklist_item
 (section_id, item_code, requirement_text, convention_reference, response_type, unit, applicability_rule, weight, display_order) VALUES
 ('22222222-0000-0000-0000-000000000009','G-01','General condition of the vessel with respect to pollution prevention',NULL,'SINGLE_SELECT',NULL,NULL,1,1),
 ('22222222-0000-0000-0000-000000000009','G-02','General information, comments and remarks',NULL,'FREE_TEXT',NULL,NULL,0,2);

-- ------------------------- OPTION SETS -------------------------------
INSERT INTO response_option (item_id, option_label, option_order)
SELECT ci.item_id, v.label, v.ord
FROM checklist_item ci
JOIN (VALUES ('Bagged',1),('Loose',2),('Bulk',3),('Segregated',4),('Labelled',5)) AS v(label,ord) ON TRUE
WHERE ci.item_code = 'V-05';

INSERT INTO response_option (item_id, option_label, option_order)
SELECT ci.item_id, v.label, v.ord
FROM checklist_item ci
JOIN (VALUES
  ('A - Plastics',1),('B - Food wastes',2),('C - Domestic wastes',3),
  ('D - Cooking oil',4),('E - Incinerator ashes',5),('F - Operational wastes',6),
  ('G - Animal carcasses',7),('H - Fishing gear',8),('I - E-waste',9),
  ('J - Cargo residues (non-HME)',10),('K - Cargo residues (HME)',11)
) AS v(label,ord) ON TRUE
WHERE ci.item_code = 'V-06';

INSERT INTO response_option (item_id, option_label, option_order)
SELECT ci.item_id, v.label, v.ord
FROM checklist_item ci
JOIN (VALUES ('Good',1),('Satisfactory',2),('Poor',3)) AS v(label,ord) ON TRUE
WHERE ci.item_code = 'G-01';

COMMIT;
