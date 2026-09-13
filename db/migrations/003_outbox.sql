-- =====================================================================
-- Migration 003 : document delivery
--
-- Two additions supporting delivery of inspection documents to the vessel:
--
--   document_access_token  a short-lived, single-purpose credential permitting a
--                   named party to retrieve one document without holding an
--                   account. Every retrieval is counted, so access is
--                   auditable rather than anonymous.
--
--   message_outbox  every message the system composes, whether or not a mail
--                   transport is configured. Composition and dispatch are
--                   separated deliberately: the record of what was sent, to
--                   whom, and when survives regardless of the transport, and
--                   a proof of concept can demonstrate the behaviour without
--                   credentials in the repository.
-- =====================================================================

BEGIN;

CREATE TYPE message_state_t AS ENUM ('QUEUED','SENT','FAILED','SUPPRESSED');
CREATE TYPE token_purpose_t AS ENUM ('MCI_REPORT','WASTE_NOTE','CASE_BUNDLE');

-- The token is stored as a SHA-256 hash, never in plaintext. A leaked
-- database therefore yields no working links, and a link that has been
-- issued cannot be recovered from the store by anyone, including an
-- administrator. Only the holder of the original link can use it.
CREATE TABLE document_access_token (
  token_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     TEXT NOT NULL UNIQUE,
  purpose        token_purpose_t NOT NULL,
  inspection_id  UUID REFERENCES inspection(inspection_id) ON DELETE CASCADE,
  wcn_id         UUID REFERENCES waste_collection_note(wcn_id) ON DELETE CASCADE,
  issued_to      TEXT,                      -- name or address the link was issued to
  issued_by      UUID REFERENCES app_user(user_id),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  last_retrieved_at TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  CONSTRAINT ck_token_subject CHECK (inspection_id IS NOT NULL OR wcn_id IS NOT NULL)
);
CREATE INDEX idx_token_lookup ON document_access_token (token_hash) WHERE revoked_at IS NULL;

CREATE TABLE message_outbox (
  message_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL DEFAULT 'EMAIL',
  recipient     TEXT NOT NULL,
  recipient_name TEXT,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  inspection_id UUID REFERENCES inspection(inspection_id) ON DELETE SET NULL,
  wcn_id        UUID REFERENCES waste_collection_note(wcn_id) ON DELETE SET NULL,
  token_id      UUID REFERENCES document_access_token(token_id) ON DELETE SET NULL,
  state         message_state_t NOT NULL DEFAULT 'QUEUED',
  queued_by     UUID REFERENCES app_user(user_id),
  queued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  failure_reason TEXT
);
CREATE INDEX idx_outbox_state ON message_outbox (state, queued_at DESC);

COMMIT;
