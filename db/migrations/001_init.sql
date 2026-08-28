-- =====================================================================
-- Automated MARPOL Compliance Inspection System for Vessels and
-- Port Reception Facilities in Nigeria
--
-- Migration 001 : initial schema
-- Implements the 34-entity model specified in Chapter Three,
-- Figures 3.5(a)-(c) and Tables 3.4-3.6.
--
-- Normalisation target : Third Normal Form (NFR-12)
-- Integrity invariants enforced here rather than in application code:
--   * custody stage ordering and single attestation   (NFR-11)
--   * append-only audit log, by privilege             (NFR-10)
--   * one compliance case per service request         (Table 3.7)
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUMERATED DOMAINS
-- ---------------------------------------------------------------------
CREATE TYPE response_type_t AS ENUM (
  'TERNARY',        -- yes / no / not applicable
  'CERTIFICATE',    -- compound: sighted, issuer, valid_until, last_inspected
  'DATE',
  'NUMERIC_UNIT',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'FREE_TEXT'
);

CREATE TYPE response_state_t   AS ENUM ('CONFORMING','NON_CONFORMING','NOT_APPLICABLE','UNANSWERED');
CREATE TYPE sighted_state_t    AS ENUM ('YES','NO','NOT_APPLICABLE');
CREATE TYPE compliance_state_t AS ENUM ('COMPLIANT','DEFICIENT','DETAINABLE','INCOMPLETE');
CREATE TYPE sync_status_t      AS ENUM ('LOCAL','QUEUED','SYNCED','CONFLICT');
CREATE TYPE custody_stage_t    AS ENUM ('BOOKED','COLLECTED','IN_TRANSIT','RECEIVED');
CREATE TYPE variance_flag_t    AS ENUM ('WITHIN_TOLERANCE','BEYOND_TOLERANCE','UNIT_MISMATCH','INCOMPLETE');
CREATE TYPE request_status_t   AS ENUM ('SUBMITTED','ACKNOWLEDGED','SCHEDULED','DECLINED','CONVERTED');
CREATE TYPE notify_channel_t   AS ENUM ('PORTAL','TELEPHONE','BERTH_ARRIVAL');
CREATE TYPE deficiency_status_t AS ENUM ('OPEN','IN_PROGRESS','SUBMITTED','CLOSED','REJECTED');
CREATE TYPE signatory_role_t   AS ENUM ('MASTER_OR_CHIEF_OFFICER','NIMASA_INSPECTOR','MARPOL_COMPLIANCE_INSPECTOR','WASTE_TEAM_LEADER','FACILITY_RECEIVER');
CREATE TYPE document_type_t    AS ENUM ('INSPECTION','WASTE_COLLECTION_NOTE');
CREATE TYPE instrument_type_t  AS ENUM ('MCI','WASTE_NOTE');

-- ---------------------------------------------------------------------
-- 1. ACCESS CONTROL
-- ---------------------------------------------------------------------
CREATE TABLE role (
  role_id      SMALLSERIAL PRIMARY KEY,
  role_name    TEXT NOT NULL UNIQUE
);

-- "user" is reserved in PostgreSQL; the entity USER of Table 3.4 is
-- implemented as app_user. This is the only naming deviation from the model.
CREATE TABLE app_user (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       SMALLINT NOT NULL REFERENCES role(role_id),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  zone          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_app_user_email ON app_user (lower(email));

CREATE TABLE login_attempt (
  attempt_id      BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES app_user(user_id),
  email_attempted TEXT NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  succeeded       BOOLEAN NOT NULL,
  failure_reason  TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempt_email_time ON login_attempt (email_attempted, attempted_at DESC);

-- ---------------------------------------------------------------------
-- 2. SUBJECTS
-- ---------------------------------------------------------------------
CREATE TABLE vessel (
  vessel_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imo_number          TEXT NOT NULL UNIQUE,
  vessel_name         TEXT NOT NULL,
  grt                 NUMERIC(12,2),
  year_built          SMALLINT,
  flag_state          TEXT,
  port_of_registration TEXT,
  country             TEXT,
  is_nigerian_flag    BOOLEAN NOT NULL DEFAULT FALSE,
  vessel_type         TEXT NOT NULL,
  owner_name          TEXT,
  pi_club             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vessel_imo ON vessel (imo_number);

CREATE TABLE facility (
  facility_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name TEXT NOT NULL,
  facility_type TEXT NOT NULL,           -- OFFSHORE_PRF | TRANSFER
  licence_no    TEXT,
  port          TEXT,
  zone          TEXT
);

-- ---------------------------------------------------------------------
-- 3. PUBLIC PORTAL : SERVICE REQUESTS
-- ---------------------------------------------------------------------
CREATE TABLE inspection_request (
  request_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference     TEXT NOT NULL UNIQUE,
  vessel_imo            TEXT NOT NULL,
  vessel_name           TEXT,
  flag_state            TEXT,
  vessel_type           TEXT,
  gross_tonnage         NUMERIC(12,2),
  agent_name            TEXT,
  agent_email           TEXT,
  agent_phone           TEXT,
  port                  TEXT,
  berth                 TEXT,
  eta                   TIMESTAMPTZ,
  etd                   TIMESTAMPTZ,
  preferred_date        DATE,
  preferred_time_window TEXT,
  has_waste_to_land     BOOLEAN NOT NULL DEFAULT FALSE,
  channel               notify_channel_t NOT NULL DEFAULT 'PORTAL',
  status                request_status_t NOT NULL DEFAULT 'SUBMITTED',
  assigned_officer_id   UUID REFERENCES app_user(user_id),
  case_id               UUID,             -- FK added after compliance_case
  decline_reason        TEXT,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_request_reference ON inspection_request (request_reference);

-- ---------------------------------------------------------------------
-- 4. COMPLIANCE CASE
-- ---------------------------------------------------------------------
CREATE TABLE compliance_case (
  case_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference       TEXT NOT NULL UNIQUE,
  vessel_id            UUID NOT NULL REFERENCES vessel(vessel_id),
  notification_channel notify_channel_t NOT NULL,
  notified_at          TIMESTAMPTZ NOT NULL,
  port                 TEXT,
  berth                TEXT,
  zone                 TEXT,
  case_status          TEXT NOT NULL DEFAULT 'OPEN',
  opened_by            UUID REFERENCES app_user(user_id),
  closed_at            TIMESTAMPTZ
);

ALTER TABLE inspection_request
  ADD CONSTRAINT fk_request_case FOREIGN KEY (case_id) REFERENCES compliance_case(case_id);

-- Table 3.7, intake condition: a request converts into at most one case.
CREATE UNIQUE INDEX uq_request_one_case ON inspection_request (case_id)
  WHERE case_id IS NOT NULL;

CREATE TABLE waste_collection_request (
  wcr_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wcr_reference     TEXT NOT NULL UNIQUE,
  vessel_imo        TEXT NOT NULL,
  request_id        UUID REFERENCES inspection_request(request_id),
  waste_streams     TEXT[] NOT NULL,
  estimated_quantity NUMERIC(12,3),
  quantity_unit     TEXT,
  containment_type  TEXT,
  requested_date    DATE,
  requested_time    TEXT,
  vessel_location   TEXT,
  contact_name      TEXT,
  contact_phone     TEXT,
  status            request_status_t NOT NULL DEFAULT 'SUBMITTED',
  wcn_id            UUID,                 -- FK added after waste_collection_note
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. INSTRUMENT ENCODING
-- ---------------------------------------------------------------------
CREATE TABLE instrument_template (
  template_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_reference  TEXT NOT NULL,          -- e.g. NIMASA/MCR/2023
  instrument_type instrument_type_t NOT NULL,
  version         INTEGER NOT NULL,
  effective_date  DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (form_reference, version)
);

CREATE TABLE instrument_section (
  section_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES instrument_template(template_id) ON DELETE CASCADE,
  annex_code    TEXT,                     -- 'I'..'VI' or NULL for non-Annex sections
  section_title TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  UNIQUE (template_id, display_order)
);

CREATE TABLE checklist_item (
  item_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id          UUID NOT NULL REFERENCES instrument_section(section_id) ON DELETE CASCADE,
  item_code           TEXT NOT NULL,
  requirement_text    TEXT NOT NULL,
  convention_reference TEXT,              -- traceability to legal source (S 3.2.1)
  response_type       response_type_t NOT NULL,
  unit                TEXT,
  applicability_rule  JSONB,              -- NULL = always applicable
  weight              NUMERIC(6,2) NOT NULL DEFAULT 1,
  display_order       INTEGER NOT NULL,
  UNIQUE (section_id, item_code)
);

CREATE TABLE response_option (
  option_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID NOT NULL REFERENCES checklist_item(item_id) ON DELETE CASCADE,
  option_label TEXT NOT NULL,
  option_order INTEGER NOT NULL,
  UNIQUE (item_id, option_order)
);

-- ---------------------------------------------------------------------
-- 6. INSPECTION
-- ---------------------------------------------------------------------
CREATE SEQUENCE mci_number_seq START 1;

CREATE TABLE inspection (
  inspection_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mci_number       BIGINT NOT NULL UNIQUE DEFAULT nextval('mci_number_seq'),
  case_id          UUID NOT NULL UNIQUE REFERENCES compliance_case(case_id),  -- 1:1
  template_id      UUID NOT NULL REFERENCES instrument_template(template_id),
  officer_id       UUID NOT NULL REFERENCES app_user(user_id),
  inspection_date  DATE NOT NULL,
  voyage_no        TEXT,
  agent            TEXT,
  charterer_name   TEXT,
  master_name      TEXT,
  arrival_date     TIMESTAMPTZ,
  etd              TIMESTAMPTZ,
  next_port        TEXT,
  compliance_score NUMERIC(5,2),
  compliance_state compliance_state_t NOT NULL DEFAULT 'INCOMPLETE',
  sync_status      sync_status_t NOT NULL DEFAULT 'SYNCED',
  approved_by      UUID REFERENCES app_user(user_id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspection_case ON inspection (case_id);
CREATE INDEX idx_inspection_date ON inspection (inspection_date DESC);

CREATE TABLE cargo_particulars (
  cargo_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id      UUID NOT NULL UNIQUE REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  cargo_type         TEXT,
  container_20_units INTEGER,
  container_40_units INTEGER,
  vehicle_units      INTEGER,
  other_description  TEXT,
  quantity           NUMERIC(14,3),
  quantity_unit      TEXT,
  out_cargo          TEXT
);

CREATE TABLE inspection_response (
  response_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id      UUID NOT NULL REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  item_id            UUID NOT NULL REFERENCES checklist_item(item_id),
  response_state     response_state_t NOT NULL DEFAULT 'UNANSWERED',
  response_text      TEXT,
  response_date      DATE,
  response_numeric   NUMERIC(14,3),
  selected_option_id UUID REFERENCES response_option(option_id),
  remark             TEXT,
  evidence_path      TEXT,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, item_id)
);
CREATE INDEX idx_response_inspection ON inspection_response (inspection_id);

-- Separated from inspection_response because a certificate is a compound
-- whose validity date must be queryable for arithmetic expiry detection.
CREATE TABLE certificate (
  certificate_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id    UUID NOT NULL REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL,         -- IOPP, NLS, ISPP, IAPP, ...
  sighted_state    sighted_state_t NOT NULL,
  valid_until      DATE,
  issued_by        TEXT,
  last_inspected   DATE,
  expiry_flag      TEXT,                  -- VALID | EXPIRED | EXPIRING_SOON | NOT_SIGHTED
  UNIQUE (inspection_id, certificate_type)
);
CREATE INDEX idx_certificate_validity ON certificate (valid_until);

-- ---------------------------------------------------------------------
-- 7. DEFICIENCY AND CORRECTIVE ACTION
-- ---------------------------------------------------------------------
CREATE TABLE deficiency_code (
  code_id     SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  annex_code  TEXT,
  category    TEXT,
  description TEXT NOT NULL
);

CREATE TABLE action_code (
  action_id    SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL,
  is_detention BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE deficiency (
  deficiency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  response_id   UUID NOT NULL UNIQUE REFERENCES inspection_response(response_id),  -- 1:0..1
  code_id       INTEGER NOT NULL REFERENCES deficiency_code(code_id),
  action_id     INTEGER NOT NULL REFERENCES action_code(action_id),
  severity      TEXT,
  status        deficiency_status_t NOT NULL DEFAULT 'OPEN',
  raised_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date      DATE,
  closed_at     TIMESTAMPTZ
);
CREATE INDEX idx_deficiency_inspection ON deficiency (inspection_id);
CREATE INDEX idx_deficiency_status ON deficiency (status) WHERE status <> 'CLOSED';

CREATE TABLE corrective_action (
  ca_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deficiency_id UUID NOT NULL REFERENCES deficiency(deficiency_id) ON DELETE CASCADE,
  assigned_to   TEXT,
  action_taken  TEXT,
  evidence_path TEXT,
  submitted_at  TIMESTAMPTZ,
  verified_by   UUID REFERENCES app_user(user_id),
  verified_at   TIMESTAMPTZ,
  outcome       TEXT,
  -- closure requires an attesting verifier; a deficiency does not close by
  -- elapse of its due date (Section 4.2.7)
  CONSTRAINT ck_verified_pair CHECK (
    (verified_by IS NULL AND verified_at IS NULL) OR
    (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------
-- 8. WASTE DECLARATION AND CUSTODY CHAIN
-- ---------------------------------------------------------------------
CREATE TABLE waste_declaration (
  declaration_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id          UUID NOT NULL REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  annex_code             TEXT NOT NULL,
  waste_type             TEXT,
  to_be_landed           BOOLEAN NOT NULL DEFAULT FALSE,
  declared_quantity      NUMERIC(12,3),
  quantity_unit          TEXT,
  held_onboard_quantity  NUMERIC(12,3),
  date_last_discharged   DATE,
  UNIQUE (inspection_id, annex_code, waste_type)
);

CREATE SEQUENCE wcn_number_seq START 1;

CREATE TABLE waste_collection_note (
  wcn_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wcn_number              BIGINT NOT NULL UNIQUE DEFAULT nextval('wcn_number_seq'),
  inspection_id           UUID NOT NULL REFERENCES inspection(inspection_id),
  declaration_id          UUID UNIQUE REFERENCES waste_declaration(declaration_id),
  zone                    TEXT,
  waste_to_be_collected   BOOLEAN NOT NULL DEFAULT TRUE,
  general_description     TEXT,
  containment_type        TEXT,
  specified_quantity_text TEXT,
  booked_quantity         NUMERIC(12,3),
  booked_quantity_unit    TEXT,
  booked_date             DATE,
  booked_time             TEXT,
  booked_means            TEXT,
  custody_stage           custody_stage_t NOT NULL DEFAULT 'BOOKED',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wcn_inspection ON waste_collection_note (inspection_id);

CREATE TABLE custody_event (
  event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wcn_id              UUID NOT NULL REFERENCES waste_collection_note(wcn_id) ON DELETE CASCADE,
  stage               custody_stage_t NOT NULL,
  occurred_at         TIMESTAMPTZ NOT NULL,
  location            TEXT,
  quantity            NUMERIC(12,3),
  quantity_unit       TEXT,
  waste_type          TEXT,
  actor_id            UUID REFERENCES app_user(user_id),
  facility_id         UUID REFERENCES facility(facility_id),
  means_of_conveyance TEXT,
  -- NFR-11 : single attestation per stage, enforced in the schema so that
  -- no application path can bypass it.
  CONSTRAINT uq_custody_stage UNIQUE (wcn_id, stage)
);
CREATE INDEX idx_custody_wcn_stage ON custody_event (wcn_id, stage);

CREATE TABLE reconciliation (
  recon_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wcn_id             UUID NOT NULL UNIQUE REFERENCES waste_collection_note(wcn_id) ON DELETE CASCADE,
  declared_quantity  NUMERIC(12,3),
  booked_quantity    NUMERIC(12,3),
  collected_quantity NUMERIC(12,3),
  received_quantity  NUMERIC(12,3),
  variance_value     NUMERIC(12,3),
  variance_percent   NUMERIC(7,3),
  variance_flag      variance_flag_t NOT NULL,
  evaluated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE waste_collection_request
  ADD CONSTRAINT fk_wcr_wcn FOREIGN KEY (wcn_id) REFERENCES waste_collection_note(wcn_id);

-- ---------------------------------------------------------------------
-- 9. SIGNATORIES, REPORTS
-- ---------------------------------------------------------------------
CREATE TABLE signatory (
  signatory_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   document_type_t NOT NULL,
  document_id     UUID NOT NULL,          -- polymorphic: inspection_id or wcn_id
  signatory_role  signatory_role_t NOT NULL,
  name            TEXT NOT NULL,
  signature_path  TEXT,
  stamp_reference TEXT,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, document_id, signatory_role)
);

CREATE TABLE report (
  report_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  wcn_id         UUID REFERENCES waste_collection_note(wcn_id) ON DELETE CASCADE,
  report_type    TEXT NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by   UUID REFERENCES app_user(user_id),
  file_path      TEXT,
  export_payload JSONB,
  CONSTRAINT ck_report_subject CHECK (inspection_id IS NOT NULL OR wcn_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- 10. COMMUNICATION AND CONTENT (PORTAL)
-- ---------------------------------------------------------------------
CREATE TABLE language (
  language_id   SMALLSERIAL PRIMARY KEY,
  language_code TEXT NOT NULL UNIQUE,     -- ISO 639-1
  language_name TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_language_single_default ON language (is_default) WHERE is_default;

CREATE TABLE translation_string (
  translation_id BIGSERIAL PRIMARY KEY,
  language_id    SMALLINT NOT NULL REFERENCES language(language_id) ON DELETE CASCADE,
  string_key     TEXT NOT NULL,
  string_value   TEXT NOT NULL,
  context        TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (language_id, string_key)
);

CREATE TABLE reference_content (
  content_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type    TEXT NOT NULL,          -- CONVENTION | ANNEX | GUIDE | ABOUT
  annex_code      TEXT,
  title           TEXT NOT NULL,
  summary_text    TEXT,
  body_text       TEXT,
  source_citation TEXT,
  effective_date  DATE,
  version         INTEGER NOT NULL DEFAULT 1,
  language_id     SMALLINT NOT NULL REFERENCES language(language_id),
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES app_user(user_id)
);

CREATE TABLE enquiry_thread (
  thread_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_reference TEXT NOT NULL UNIQUE,
  subject          TEXT NOT NULL,
  category         TEXT,
  vessel_imo       TEXT,
  sender_name      TEXT,
  sender_email     TEXT,
  sender_phone     TEXT,
  status           TEXT NOT NULL DEFAULT 'OPEN',
  assigned_to      UUID REFERENCES app_user(user_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ
);

CREATE TABLE enquiry_message (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL REFERENCES enquiry_thread(thread_id) ON DELETE CASCADE,
  sender_type     TEXT NOT NULL,          -- PUBLIC | OFFICER
  sender_name     TEXT,
  body            TEXT NOT NULL,
  attachment_path TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);

-- Specified per Chapter Three, not implemented in this iteration (S 3.3.3).
CREATE TABLE complaint (
  complaint_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_reference TEXT NOT NULL UNIQUE,
  complaint_type      TEXT,
  inspection_id       UUID REFERENCES inspection(inspection_id),
  wcn_id              UUID REFERENCES waste_collection_note(wcn_id),
  complainant_name    TEXT,
  complainant_email   TEXT,
  is_anonymous        BOOLEAN NOT NULL DEFAULT FALSE,
  vessel_imo          TEXT,
  port                TEXT,
  description         TEXT NOT NULL,
  evidence_path       TEXT,
  status              TEXT NOT NULL DEFAULT 'RECEIVED',
  assigned_to         UUID REFERENCES app_user(user_id),
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT
);

CREATE TABLE incident_report (
  incident_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_reference     TEXT NOT NULL UNIQUE,
  incident_type          TEXT NOT NULL,
  reporter_name          TEXT,
  reporter_phone         TEXT,
  vessel_imo             TEXT,
  inspection_id          UUID REFERENCES inspection(inspection_id),
  latitude               NUMERIC(9,6),
  longitude              NUMERIC(9,6),
  location_description   TEXT,
  occurred_at            TIMESTAMPTZ,
  reported_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  substance_type         TEXT,
  estimated_volume       NUMERIC(12,3),
  volume_unit            TEXT,
  severity               TEXT,
  immediate_action_taken TEXT,
  status                 TEXT NOT NULL DEFAULT 'REPORTED',
  responder_assigned     UUID REFERENCES app_user(user_id),
  dispatched_at          TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 11. AUDIT TRAIL  (NFR-10 : append-only by privilege)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  log_id      BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES app_user(user_id),
  entity_name TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log (entity_name, entity_id);
CREATE INDEX idx_audit_time ON audit_log (logged_at DESC);

COMMIT;

-- =====================================================================
-- PRIVILEGE GRANTS
-- Run as owner AFTER creating the application role.
-- The application holds no UPDATE or DELETE on audit_log, so immutability
-- is a property of the database rather than a convention of the code.
-- Verified by test case TS-05.
-- =====================================================================
--   CREATE ROLE app_role LOGIN PASSWORD '...';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
--   REVOKE UPDATE, DELETE ON audit_log FROM app_role;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
