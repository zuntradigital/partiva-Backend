-- SRS §28 (Change History): the audit_log table already captures Changed By
-- (user_id/user_name/user_email) and Change Timestamp/Effective Date
-- (created_at -- pricing_settings changes apply immediately, there is no
-- scheduling mechanism, so "effective date" and "change timestamp" are the
-- same moment here) for every /api/admin/* mutation via the existing
-- generic auditLogMiddleware. What it couldn't capture was a true "Previous
-- Value": `details` (VARCHAR(1000)) is filled by extractDetails(), which
-- only reads top-level primitive request-body fields -- a config PUT sends
-- { value: {...nested object...} }, which isn't a primitive, so `details`
-- was silently NULL for these edits, and no prior value was ever read at all.
--
-- This adds one column to the existing table (no new table, no parallel
-- logging system) for a full before-snapshot, read from the database prior
-- to the write. A single commission_config snapshot alone already exceeds
-- 1000 characters (measured ~1600 bytes as compact JSON), so the existing
-- `details` VARCHAR(1000) column -- which is what the "New Value" side
-- reuses -- is widened to TEXT too, or the new value itself would be
-- silently truncated. Widening VARCHAR(1000) to TEXT is lossless for every
-- existing row and every other resource type's shorter `details` strings;
-- nothing currently stored changes.
ALTER TABLE audit_log
  MODIFY COLUMN details TEXT NULL,
  ADD COLUMN previous_value TEXT NULL AFTER details;
