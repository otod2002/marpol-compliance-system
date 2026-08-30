-- =====================================================================
-- Migration 002 : synchronisation control columns
--
-- Required by the conflict-detection policy of Table 3.7:
--   payload_hash    identifies a retransmission of an already-accepted
--                   record, so a retry is idempotent            (TO-09)
--   record_version  monotonic counter; a device whose base version is
--                   behind the server is rejected rather than
--                   overwriting, and BOTH versions are preserved (TO-10)
-- =====================================================================

BEGIN;

ALTER TABLE inspection
  ADD COLUMN payload_hash   TEXT,
  ADD COLUMN record_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_inspection_payload_hash ON inspection (payload_hash);

COMMIT;
