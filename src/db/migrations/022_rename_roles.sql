-- Role consolidation: SEO Manager is removed entirely (0 users held it);
-- the remaining 4 roles keep their permissions but are renamed to match the
-- new role model. Order matters -- renaming 'Editor' to 'Author' first
-- frees the 'Editor' name before 'Content Manager' claims it, avoiding the
-- UNIQUE constraint on roles.name.
UPDATE roles SET name = 'Author' WHERE name = 'Editor';
UPDATE roles SET name = 'Editor' WHERE name = 'Content Manager';
UPDATE roles SET name = 'Sales' WHERE name = 'Pricing Manager';
DELETE FROM roles WHERE name = 'SEO Manager';
