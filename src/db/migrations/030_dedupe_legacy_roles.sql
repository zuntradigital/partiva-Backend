-- One-time cleanup for the duplicate-roles bug: migrate.ts had no run-once
-- tracking, so every full re-run replayed 005_seed_roles.sql's INSERT
-- IGNORE for 'Content Manager' / 'SEO Manager' / 'Pricing Manager' after
-- 022_rename_roles.sql had freed those names up, silently recreating them
-- as duplicate rows. 022's renames then collided with names they'd already
-- produced on the prior run (a plain UNIQUE-constraint error, uncaught),
-- aborting before 027_remove_legacy_default_roles.sql -- meant to delete
-- exactly these rows -- ever ran. migrate.ts now tracks applied files so
-- this can never recur; this migration clears out whatever duplicates are
-- currently sitting in the database from before that fix.
--
-- Only removes a duplicate legacy role if no admin user is currently
-- assigned to it (LEFT JOIN ... IS NULL guard) -- if someone was actually
-- assigned one of these via the buggy list in the Roles UI, it's left in
-- place rather than silently stripping their role; role_permissions rows
-- for any role that IS deleted are removed automatically via its
-- ON DELETE CASCADE (see 024_rbac_extend.sql).
DELETE roles FROM roles
LEFT JOIN user_roles ON user_roles.role_id = roles.id
WHERE roles.name IN ('Content Manager', 'SEO Manager', 'Pricing Manager')
  AND user_roles.role_id IS NULL;
