-- =====================================================================
-- Seed 01 : roles, languages, and controlled vocabularies
--
-- The deficiency and action vocabularies derive from the IMO Procedures
-- for Port State Control, 2025 (Assembly Resolution A.1206(34)), NOT from
-- the NIMASA form, which contains no deficiency coding. See Chapter Three,
-- Section 3.2.1, where this is recorded as a designed addition rather than
-- an automation of existing practice.
--
-- VERIFY BEFORE SUBMISSION: the action code list below reproduces the
-- structure of the IMO action-code scheme. Confirm each code and wording
-- against the current text of A.1206(34) before relying on it.
-- =====================================================================

BEGIN;

INSERT INTO role (role_name) VALUES
  ('COMPLIANCE_OFFICER'),
  ('WASTE_TEAM_LEADER'),
  ('FACILITY_RECEIVER'),
  ('SUPERVISOR'),
  ('ADMINISTRATOR'),
  ('VESSEL_AGENT');

INSERT INTO language (language_code, language_name, is_active, is_default) VALUES
  ('en', 'English',    TRUE, TRUE),
  ('fr', 'Français',   TRUE, FALSE),
  ('es', 'Español',    TRUE, FALSE),
  ('zh', '中文',        TRUE, FALSE);

-- ---------------------------------------------------------------------
-- Action codes (IMO scheme structure)
-- ---------------------------------------------------------------------
INSERT INTO action_code (code, description, is_detention) VALUES
  ('10', 'Deficiency rectified',                                   FALSE),
  ('15', 'Rectify deficiency at next port',                        FALSE),
  ('16', 'Rectify deficiency within 14 days',                      FALSE),
  ('17', 'Rectify deficiency before departure',                    FALSE),
  ('18', 'Rectify deficiency within 3 months',                     FALSE),
  ('30', 'Detainable deficiency',                                  TRUE),
  ('40', 'Next port informed',                                     FALSE),
  ('45', 'Rectify detainable deficiency at agreed repair port',    TRUE),
  ('50', 'Flag State consulted',                                   FALSE),
  ('99', 'Other (specify in remarks)',                             FALSE);

-- ---------------------------------------------------------------------
-- Deficiency codes, grouped by Annex
-- ---------------------------------------------------------------------
INSERT INTO deficiency_code (code, annex_code, category, description) VALUES
  ('01101','I','Certificate','International Oil Pollution Prevention Certificate missing, invalid or expired'),
  ('01102','I','Record','Oil Record Book Part I not maintained or entries incomplete'),
  ('01103','I','Record','Oil Record Book Part II not maintained (tankers)'),
  ('01104','I','Equipment','Oily water separating equipment inoperative or bypassed'),
  ('01105','I','Equipment','15 ppm alarm arrangement inoperative'),
  ('01106','I','Plan','Shipboard Oil Pollution Emergency Plan absent or not approved'),
  ('01107','I','Operational','Scuppers or save-alls not plugged during bunkering'),
  ('01108','I','Retention','Sludge or bilge retention capacity inadequate for the intended voyage'),

  ('02101','II','Certificate','Certificate of Fitness or NLS Certificate missing, invalid or expired'),
  ('02102','II','Record','Cargo Record Book not maintained or entries incomplete'),
  ('02103','II','Manual','Procedures and Arrangements Manual absent or not approved'),

  ('03101','III','Documentation','Harmful substances stowage plan or location listing not available'),
  ('03102','III','Stowage','Packaged harmful substances improperly marked, labelled or stowed'),

  ('04101','IV','Certificate','International Sewage Pollution Prevention Certificate missing, invalid or expired'),
  ('04102','IV','Equipment','Sewage treatment plant inoperative or not type-approved'),
  ('04103','IV','Equipment','Sewage holding tank capacity or discharge arrangement deficient'),

  ('05101','V','Plan','Garbage Management Plan absent or not vessel-specific'),
  ('05102','V','Record','Garbage Record Book not maintained or entries incomplete'),
  ('05103','V','Operational','Garbage not segregated by category as the Plan requires'),
  ('05104','V','Operational','Garbage receptacles not labelled or not adequately covered'),
  ('05105','V','Placard','Garbage placards absent or not displayed in required locations'),

  ('06101','VI','Certificate','International Air Pollution Prevention Certificate missing, invalid or expired'),
  ('06102','VI','Record','Ozone-Depleting Substances Record Book not maintained'),
  ('06103','VI','Record','Bunker delivery notes or fuel samples not retained as required'),
  ('06104','VI','Equipment','Incinerator operated contrary to Annex VI requirements'),

  ('99901',NULL,'General','Other deficiency not otherwise classified (specify in remarks)');

COMMIT;
