-- Adds the remaining routes required by the Corporate Marketing Website
-- spec's sitemap (solutions + its 3 audience subpages, business-network,
-- cookies) to the existing `pages` table, mirroring 019_create_pages.sql's
-- seeding pattern exactly. Content itself is added afterward through the
-- existing Pages/Sections admin API, same as every other managed page.
INSERT IGNORE INTO pages (slug, title_ar, title_en, visible, show_in_nav, display_order) VALUES
('solutions', 'الحلول', 'Solutions', TRUE, TRUE, 16),
('business-network', 'الشبكة التجارية', 'Business Network', TRUE, TRUE, 20),
('cookies', 'سياسة ملفات تعريف الارتباط', 'Cookie policy', TRUE, TRUE, 21);
