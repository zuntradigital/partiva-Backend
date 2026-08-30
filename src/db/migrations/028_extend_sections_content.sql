-- Extends page_sections so every remaining hardcoded piece of Website copy
-- (badge/eyebrow labels, CTA button label+href, and structured card/list
-- content) becomes Dashboard-editable, without inventing a new content
-- table. Two additions:
--
-- 1) badge/CTA columns -- a short eyebrow label and up to two button
--    label+href pairs, generically usable by any section on any page.
-- 2) seed rows for "list"-type sections (trust badges, feature/step/segment
--    cards, benefit chips, highlight cards). These reuse body_ar/body_en as
--    a newline-delimited list -- the exact convention already used in
--    production by CoreValuePillarsSection ("01 — Label: sentence." per
--    line) and Home's own SolutionsSection ("Segment — Headline: body."
--    per line) -- just applied to the sections that didn't have this
--    wiring yet. Each seeded value is a verbatim copy of the current
--    hardcoded array in the corresponding website component, so nothing
--    visibly changes until an admin edits it.

ALTER TABLE page_sections
  ADD COLUMN badge_ar VARCHAR(150) NULL AFTER body_en,
  ADD COLUMN badge_en VARCHAR(150) NULL AFTER badge_ar,
  ADD COLUMN cta_label_ar VARCHAR(150) NULL AFTER badge_en,
  ADD COLUMN cta_label_en VARCHAR(150) NULL AFTER cta_label_ar,
  ADD COLUMN cta_href VARCHAR(300) NULL AFTER cta_label_en,
  ADD COLUMN cta2_label_ar VARCHAR(150) NULL AFTER cta_href,
  ADD COLUMN cta2_label_en VARCHAR(150) NULL AFTER cta2_label_ar,
  ADD COLUMN cta2_href VARCHAR(300) NULL AFTER cta2_label_en;

-- ---------- Home page: list-type data sections ----------
-- These keys are consumed directly by their component (looked up by key,
-- not rendered as a generic title+body block), same as "hero"/"cta" already are.

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'trusted-by-list', 'قائمة الثقة', 'Trusted-by list',
  'AUTO CARE\nTOP PARTS\nSAUDI SPARE\nMOTIVE PLUS\nGEAR HOUSE\nPARTS PRO',
  'AUTO CARE\nTOP PARTS\nSAUDI SPARE\nMOTIVE PLUS\nGEAR HOUSE\nPARTS PRO',
  TRUE, 100
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'features-grid', 'شبكة المزايا', 'Features grid',
  'إدارة المخزون: تتبع فريقك للمخزون مع تنبيهات ذكية للمخزون المنخفض وإدارة متعددة المستودعات\nإدارة المبيعات والمشتريات: إدارة كاملة للعملية من الطلب حتى الفاتورة مع تقارير دقيقة وتحليلات متقدمة\nإدارة العملاء والموردين: قاعدة بيانات متكاملة تجمع العملاء والموردين مع سجل كامل للمعاملات والتواصل\nالتقارير والتحليلات: تقارير شاملة تساعدك على اتخاذ قرارات أفضل وتنمية أعمالك\nصلاحيات مرنة: إدارة المستخدمين والصلاحيات بيئة لضمان أمان بيانات عملك\nمتوافق مع جميع الأجهزة: استخدم Partiva من أي مكان وفي أي وقت عبر الجوال أو الكمبيوتر',
  'Inventory management: Track inventory with low-stock alerts and multi-warehouse management.\nSales & purchasing: Manage the whole process from order to invoice with accurate reports and analytics.\nCustomers & suppliers: A complete customer and supplier database with a full transaction history.\nReports & analytics: Clear reports that help you make better decisions and grow.\nFlexible permissions: Manage users and permissions to keep your business data secure.\nWorks on every device: Use Partiva anywhere, anytime, on mobile or desktop.',
  TRUE, 101
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'how-it-works-steps', 'خطوات كيف تعمل', 'How it works steps',
  '1 — أنشئ حسابك: سجل حسابك في دقائق بدون أي تعقيد.\n2 — أضف منتجاتك: استورد أو أضف منتجاتك ومخزونك بسهولة.\n3 — أضف بيانات شركتك: أدخل بيانات شركتك والإعدادات الأساسية.\n4 — ابدأ العمل: ابدأ إدارة مبيعاتك ومشترياتك وتقاريرك فور جهوزك.',
  '1 — Create your account: Register in minutes with no complexity.\n2 — Add your products: Import or add your products and inventory with ease.\n3 — Add your company details: Enter your company details and basic settings.\n4 — Start working: Start managing sales, purchases, and reports when you are ready.',
  TRUE, 102
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'how-it-works-stats', 'إحصاءات كيف تعمل', 'How it works stats',
  '+2,500 — شركة ومنجر: يثقون بمنصتنا\n+1M — منتج قدار: عبر المنصة\n+10M — عملية مكتملة: بنجاح\n99.9% — وقت تشغيل: منصة مستقرة وآمنة',
  '+2,500 — Businesses and stores: trust our platform\n+1M — Products managed: through the platform\n+10M — Completed transactions: successfully\n99.9% — Uptime: A stable and secure platform',
  TRUE, 103
FROM pages WHERE slug = 'home';

-- ---------- /how-it-works page: step cards ----------
INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'steps', 'خطوات الانضمام', 'Onboarding steps',
  '1 — التسجيل: تملى بيانات نشاطك التجاري وتختار الخطة المناسبة لك.\n2 — المراجعة: فريقنا بيراجع الطلب قبل أي تفعيل — الطلب بيكون بحالة قيد المراجعة.\n3 — الاعتماد: بتوصلك رسالة على الإيميل بقرار الطلب — قبول أو رفض.\n4 — البدء الفعلي: لما يتم قبول طلبك، تقدر تدخل بحسابك وتبدأ تستخدم المنصة.',
  '1 — Registration: Fill in your business details and choose the plan that fits you.\n2 — Review: Our team reviews your request before activation — the request remains under review.\n3 — Approval: You receive an email with the request decision — approved or rejected.\n4 — Getting started: Once your request is approved, you can sign in and start using the platform.',
  TRUE, 100
FROM pages WHERE slug = 'how-it-works';

-- ---------- /about page: dual-model cards, segment cards, steps strip ----------
INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'dual-model', 'الموديل المزدوج', 'The dual model',
  'إدارة عملك بشكل مستقل: نظام كامل لإدارة نشاطك التجاري وحده، بدون أي التزام بالشبكة.\nشبكة تجارية اختيارية: انضم اختياريًا للبحث والبيع والشراء مع تجار آخرين على الشبكة.',
  'Manage your business independently: A complete system to manage your business on its own, with no commitment to the network.\nAn optional trade network: Join optionally to search, sell, and buy with other traders on the network.',
  TRUE, 100
FROM pages WHERE slug = 'about';

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'segments', 'حلول لكل فئة', 'Solutions for every segment',
  'تاجر تجزئة: إدارة سريعة وسهلة لفرع واحد\nورش الصيانة: مقارنة الأسعار والتوفر بين الموردين\nموزّعون ومستوردون: إدارة متعددة الفروع بصلاحيات مخصصة',
  'Retailer: Fast and easy management for a single branch\nMaintenance workshops: Compare prices and availability across suppliers\nDistributors and importers: Multi-branch management with custom permissions',
  TRUE, 101
FROM pages WHERE slug = 'about';

INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'about-steps', 'كيف تبدأ', 'How to start',
  'التسجيل\nالمراجعة\nالاعتماد\nالبدء الفعلي',
  'Registration\nReview\nApproval\nGetting started',
  TRUE, 102
FROM pages WHERE slug = 'about';

-- ---------- /solutions page: benefit chips (shared across the 3 spotlight cards) ----------
INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'benefits', 'مزايا الحلول', 'Solution benefits',
  'نمو أسرع\nتوفير الوقت\nإدارة أسهل',
  'Faster growth\nTime-saving\nEasier management',
  TRUE, 200
FROM pages WHERE slug = 'solutions';

-- ---------- /business-network page: highlight cards ----------
INSERT INTO page_sections (page_id, section_key, title_ar, title_en, body_ar, body_en, visible, display_order)
SELECT id, 'highlights', 'أبرز المزايا', 'Network highlights',
  'تواصل فعال: تواصل مع أنشطة موثوقة بسهولة\nبيئة آمنة: تعاون وحماية بياناتك بأعلى معايير\nنمو مستدام: وسع نطاق أعمالك مع شبكة موثوقة',
  'Effective communication: Easily connect with verified businesses\nSecure environment: Collaborate with your data protected to the highest standards\nSustainable growth: Expand your business reach with a trusted network',
  TRUE, 100
FROM pages WHERE slug = 'business-network';
