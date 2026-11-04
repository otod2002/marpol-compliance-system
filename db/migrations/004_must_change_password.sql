-- ---------------------------------------------------------------------
-- Forced password change after an administrator reset.
--
-- Only an administrator may set another account's password, which leaves
-- a window in which the administrator knows a working credential for
-- someone else. The flag closes it: a reset marks the account, the token
-- issued at the next sign-in carries the mark, and the server refuses
-- every route except the change itself until a new password is set.
--
-- The flag is raised by a reset, not by account creation, because the
-- initial password is issued face to face and the account is not yet in
-- use. Raising it at creation would be defensible; it is not done here so
-- that the behaviour evaluated in Chapter Five is the behaviour shipped.
-- ---------------------------------------------------------------------
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN app_user.must_change_password IS
  'Set by an administrator password reset; cleared when the holder sets their own password.';
