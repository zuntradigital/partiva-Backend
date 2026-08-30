-- JWT revocation: each token is signed with the user's token_version at
-- login time; requireAuth rejects a token whose version no longer matches
-- the current DB value. Logging out (or an admin force-logout) increments
-- this, which immediately invalidates every previously-issued token for
-- that user instead of only when it naturally expires.
ALTER TABLE admin_users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
