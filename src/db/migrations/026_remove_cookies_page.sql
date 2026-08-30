-- Removes the Cookie Policy page (added by 025_add_solutions_network_cookies_pages.sql)
-- per an explicit product decision to drop this page entirely. `page_sections`
-- rows for it are removed automatically via ON DELETE CASCADE (see
-- 019_create_pages.sql). Privacy Policy and Terms & Conditions, seeded
-- separately in 019_create_pages.sql, are untouched.
DELETE FROM pages WHERE slug = 'cookies';
