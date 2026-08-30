-- Pages mirror the Website's fixed route list (routes are defined by the
-- Next.js app folder structure, not created here) -- this table only stores
-- each route's Dashboard-managed metadata: visibility and nav placement.
CREATE TABLE IF NOT EXISTS pages (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(100) NOT NULL UNIQUE,
  title_ar VARCHAR(200) NOT NULL,
  title_en VARCHAR(200) NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_nav BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pages_visible_order (visible, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sections are the content blocks a page is composed of (e.g. the
-- homepage's Hero/Features/Pricing/... blocks). Kept separate from `pages`
-- so a page's route-level visibility/nav flags are independent of any
-- individual section's own visibility and text content.
CREATE TABLE IF NOT EXISTS page_sections (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  page_id INT UNSIGNED NOT NULL,
  section_key VARCHAR(100) NOT NULL,
  title_ar VARCHAR(300) NULL,
  title_en VARCHAR(300) NULL,
  body_ar TEXT NULL,
  body_en TEXT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_page_sections_page (page_id, display_order),
  CONSTRAINT fk_page_sections_page FOREIGN KEY (page_id) REFERENCES pages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeded from the Website's actual routes (src/app/(pages)/* + home).
-- show_in_nav reflects which ones the Footer/Navbar already link to today.
INSERT IGNORE INTO pages (slug, title_ar, title_en, visible, show_in_nav, display_order) VALUES
('home', 'الرئيسية', 'Home', TRUE, TRUE, 1),
('features', 'المميزات', 'Features', TRUE, TRUE, 2),
('how-it-works', 'كيف تعمل', 'How it works', TRUE, FALSE, 3),
('pricing', 'الأسعار', 'Pricing', TRUE, TRUE, 4),
('articles', 'المدونة', 'Blog', TRUE, TRUE, 5),
('faq', 'الأسئلة الشائعة', 'FAQ', TRUE, TRUE, 6),
('about', 'من نحن', 'About us', TRUE, TRUE, 7),
('contact', 'اتصل بنا', 'Contact us', TRUE, TRUE, 8),
('help', 'مركز المساعدة', 'Help center', TRUE, TRUE, 9),
('support', 'الدعم الفني', 'Technical support', TRUE, TRUE, 10),
('privacy', 'سياسة الخصوصية', 'Privacy policy', TRUE, TRUE, 11),
('terms', 'الشروط والأحكام', 'Terms & conditions', TRUE, TRUE, 12),
('login', 'تسجيل الدخول', 'Login', TRUE, FALSE, 13),
('register', 'إنشاء حساب', 'Register', TRUE, FALSE, 14),
('forgot-password', 'استعادة كلمة المرور', 'Forgot password', TRUE, FALSE, 15);

-- Homepage sections, matching src/app/page.tsx's real composition, in order.
INSERT IGNORE INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, s.section_key, s.title_ar, s.title_en, s.body_ar, s.body_en, TRUE, s.display_order
FROM pages, (
  SELECT 'hero' AS section_key, 'منصة متكاملة لإدارة أعمال قطع الغيار' AS title_ar, 'A complete platform for managing auto-parts businesses' AS title_en,
         'Partiva تساعدك على إدارة عملائك، مخزونك، مشترياتك، مبيعاتك وتقاريرك بسهولة من منصة واحدة متكاملة وآمنة.' AS body_ar,
         'Partiva helps you manage your customers, inventory, purchases, sales and reports easily from one integrated, secure platform.' AS body_en, 1 AS display_order
  UNION ALL SELECT 'trusted-by', 'يثق بنا الشركات والمتاجر في جميع أنحاء المملكة', 'Trusted by businesses across the Kingdom', NULL, NULL, 2
  UNION ALL SELECT 'features', 'كل ما تحتاجه لإدارة عملك بكفاءة', 'Everything you need to run your business efficiently', NULL, NULL, 3
  UNION ALL SELECT 'pricing', 'خطط تناسب جميع أحجام الأعمال', 'Plans for every business size', NULL, NULL, 4
  UNION ALL SELECT 'how-it-works', 'ابدأ خلال دقائق فقط', 'Get started in minutes', NULL, NULL, 5
  UNION ALL SELECT 'testimonials', 'ماذا يقول عملاؤنا عن Partiva', 'What our customers say about Partiva', NULL, NULL, 6
  UNION ALL SELECT 'cta', 'جاهز للانطلاق؟', 'Ready to get started?', NULL, NULL, 7
) AS s
WHERE pages.slug = 'home';
