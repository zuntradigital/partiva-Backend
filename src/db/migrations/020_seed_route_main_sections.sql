-- Every non-home managed route is a single-purpose page (not a multi-block
-- landing composition like Home), so each gets ONE "main" section
-- representing its entire existing content -- toggling it hides the whole
-- page's content, and admins can still add further sections (rendered via
-- the website's GenericSection fallback) alongside it.
INSERT IGNORE INTO page_sections (page_id, section_key, title_ar, title_en, visible, display_order)
SELECT id, 'main', 'المحتوى الرئيسي للصفحة', 'Page main content', TRUE, 1
FROM pages
WHERE slug IN (
  'about', 'features', 'how-it-works', 'pricing', 'faq', 'contact',
  'help', 'support', 'privacy', 'terms', 'login', 'register', 'forgot-password'
);
