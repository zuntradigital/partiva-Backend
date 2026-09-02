-- Adds the new /for-merchants marketing route (SRS §22) to the existing
-- `pages` table so it can appear in the Navbar/Footer and be managed from
-- the Dashboard's Pages screen, mirroring 019_create_pages.sql/
-- 025_add_solutions_network_cookies_pages.sql's exact seeding pattern.
-- Content itself is a static Next.js page (src/app/(pages)/for-merchants),
-- same as every other route in this table.
INSERT IGNORE INTO pages (slug, title_ar, title_en, visible, show_in_nav, display_order) VALUES
('for-merchants', 'للتجار', 'For Merchants', TRUE, TRUE, 22);

-- Same "main" section every other single-purpose route gets (see
-- 020_seed_route_main_sections.sql) so resolveMainAndExtras() treats the
-- page's built-in content as visible by default, with an admin able to
-- hide it or override its hero title/body from the Dashboard.
INSERT IGNORE INTO page_sections (page_id, section_key, title_ar, title_en, visible, display_order)
SELECT id, 'main', 'المحتوى الرئيسي للصفحة', 'Page main content', TRUE, 1
FROM pages WHERE slug = 'for-merchants';
