-- Monetization Master Change Directive v1.0 (C:\Users\zyntra Digitl\Desktop\Partiva\
-- PARTIVA_Monetization_Master_Change_Directive_v1.0.md):
--
-- §15 Pricing Versioning requires each configuration change to carry a
-- "Reason / Change Note" alongside who/when/previous/new (the rest of which
-- 034_add_audit_log_previous_value.sql already added). This adds the one
-- missing field to the same existing audit_log table -- no new table, no
-- parallel history mechanism.
ALTER TABLE audit_log
  ADD COLUMN reason VARCHAR(500) NULL AFTER previous_value;

-- §45 Database Impact / §74 Legacy Data Preservation: pricing_plans is the
-- old subscription-package model, superseded by the transaction-commission
-- model (pricing_settings.commission_config). Per the Directive's explicit
-- process ("DO NOT delete immediately... mark legacy entities as LEGACY /
-- READ-ONLY / DEPRECATED where appropriate"), this only documents the
-- table's status -- it changes no data, no rows, no application behavior.
-- The table currently has zero rows and its admin CRUD/workflow already sit
-- fully idle since the website stopped rendering it (SRS §36, Step 1); nothing
-- about that changes here.
ALTER TABLE pricing_plans
  COMMENT = 'LEGACY/DEPRECATED: old per-plan subscription pricing model, superseded by pricing_settings.commission_config (transaction-based commission model). Preserved per Monetization Master Change Directive v1.0 §45/§74 -- not deleted, not actively used by the current pricing pages.';
