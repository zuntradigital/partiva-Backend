-- Pricing draft/review/publish workflow. `active` keeps its existing
-- meaning (gates what the public API returns) and existing rows/queries are
-- untouched -- a plan's live name_ar/price/etc. columns are ONLY ever
-- changed by an approved edit. A Sales edit to an already-published plan
-- (active=TRUE) is instead buffered in `pending_changes` (a JSON snapshot of
-- the proposed field values) until an Editor approves it, so the public
-- Website keeps showing the current live values throughout the review.
-- A brand-new plan (not yet published) is edited directly in its main
-- columns since there is nothing live to protect yet.
ALTER TABLE pricing_plans
  ADD COLUMN pending_status ENUM('draft', 'review', 'rejected') NULL AFTER active,
  ADD COLUMN pending_changes JSON NULL AFTER pending_status,
  ADD COLUMN submitted_by INT UNSIGNED NULL AFTER pending_changes,
  ADD COLUMN rejection_comment TEXT NULL AFTER submitted_by,
  ADD CONSTRAINT fk_pricing_plans_submitted_by FOREIGN KEY (submitted_by)
    REFERENCES admin_users (id) ON DELETE SET NULL;

-- Existing plans are already live -- mark any currently-inactive plan as a
-- draft so it enters the same workflow instead of silently having no state.
UPDATE pricing_plans SET pending_status = 'draft' WHERE active = FALSE;
