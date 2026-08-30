-- 005_seed_roles.sql's INSERT IGNORE re-creates 'Content Manager', 'SEO
-- Manager', and 'Pricing Manager' on every migration re-run (this runner has
-- no tracking table, so it always re-applies every file) once their names no
-- longer exist for IGNORE to skip -- which is exactly what happened after
-- 022_rename_roles.sql renamed/removed them the first time. Only these 4
-- default roles should ever exist: Super Admin, Editor, Author, Sales.
-- No admin_users or role_permissions reference these legacy roles (verified
-- before writing this migration), so this DELETE is safe and, like the rest
-- of this project's migrations, idempotent -- a no-op once already applied.
DELETE FROM roles WHERE name IN ('Content Manager', 'SEO Manager', 'Pricing Manager');
