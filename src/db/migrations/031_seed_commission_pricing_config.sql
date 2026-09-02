-- New transaction-based pricing model (replaces the subscription/package
-- model on the marketing website only -- pricing_plans and its
-- draft/review/approve workflow are untouched, still used elsewhere).
-- Single JSON config row under the existing generic pricing_settings table
-- (see 014_create_pricing_plans.sql) so the website reads it the same way
-- it already reads `custom_contact`, and an admin can edit every value from
-- the Dashboard without a redeploy.
INSERT IGNORE INTO pricing_settings (setting_key, value) VALUES (
  'commission_config',
  '{
    "freePartsLimit": 100,
    "freePeriodDays": 90,
    "currency": "SAR",
    "tiers": [
      {"min": 1, "max": 500, "rate": 2.00},
      {"min": 501, "max": 2000, "rate": 1.75},
      {"min": 2001, "max": null, "rate": 1.50}
    ],
    "headlineAr": "بدون اشتراك شهري. ادفع فقط عندما تبيع.",
    "headlineEn": "No Monthly Subscription. Pay Only When You Sell.",
    "descriptionAr": "انضم إلى Partiva مجانًا، أضف منتجاتك، وابدأ الوصول للعملاء عبر شبكتنا. أول 100 قطعة ناجحة أو أول 90 يومًا بدون عمولة، أيهما يأتي أولًا.",
    "descriptionEn": "Join Partiva for free, list your inventory, and start reaching customers through our network. Your first 100 successful parts or your first 90 days are commission-free, whichever comes first.",
    "disclaimerAr": "الأسعار ونسب العمولة تخضع للشروط التجارية المعمول بها لدى Partiva وقد يتم تحديثها من وقت لآخر. تُحدَّد النسبة المطبقة على التاجر وفقًا لحالته وحجم معاملاته وشروط التسعير السارية وقت المعاملة.",
    "disclaimerEn": "Pricing and commission rates are subject to Partiva''s applicable commercial terms and may be updated from time to time. The applicable rate for a merchant is determined according to the merchant''s status, transaction volume, and the pricing terms effective at the time of the applicable transaction.",
    "ctaTextAr": "انضم إلى Partiva مجانًا",
    "ctaTextEn": "Join Partiva Free",
    "ctaSecondaryTextAr": "كيف تعمل",
    "ctaSecondaryTextEn": "How It Works"
  }'
);

-- The homepage's "pricing" page_section (019_create_pages.sql) still carries
-- its original title from the old plan-cards model ("Plans for every
-- business size"). PricingSection.tsx now falls back to commission_config's
-- headline whenever no admin-authored body accompanies this title, so this
-- update is a data-hygiene cleanup (not required for correctness) -- it only
-- applies if the row still has that exact original value, so an admin's own
-- customization is left untouched.
UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.title_ar = 'بدون اشتراك شهري. ادفع فقط عندما تبيع.',
    ps.title_en = 'No Monthly Subscription. Pay Only When You Sell.'
WHERE p.slug = 'home' AND ps.section_key = 'pricing'
  AND ps.title_ar = 'خطط تناسب جميع أحجام الأعمال';

-- The Terms & Conditions page's "plans"/"changes"/"trial"/"refund"
-- page_sections (page_id for slug 'terms', seeded as admin-authored content
-- some time before this migration) describe the OLD subscription-plan model
-- verbatim ("Free Trial, Basic, Professional, and Enterprise", "change your
-- subscription plan", a 14-day refund of a subscription payment that no
-- longer exists). TermsContent.tsx renders this DB content directly when
-- present, so the page's own code fallback text was not enough to remove
-- this from the live site -- AC-01/AC-11 require no old pricing model text
-- anywhere on the site. Each UPDATE is guarded on the exact original
-- body_en value, so it only fires if that row still holds the original
-- seeded text -- any different admin edit made since is left untouched.
UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.title_ar = 'التسعير والعمولة', ps.title_en = 'Pricing & Commission',
    ps.body_ar = 'لا تعتمد Partiva على خطط اشتراك شهرية. التسجيل والتفعيل وإدراج المنتجات والظهور على الشبكة مجانية بالكامل، وتُحصّل Partiva عمولة فقط على المعاملات الناجحة التي تتم عبر المنصة. للتفاصيل الكاملة عن الفترة المجانية وشرائح العمولة، راجع صفحة الأسعار.',
    ps.body_en = 'Partiva does not offer monthly subscription plans. Registration, activation, product listing, and network visibility are entirely free, and Partiva only earns a commission on successful transactions completed through the platform. See the Pricing page for full details on the free period and commission tiers.'
WHERE p.slug = 'terms' AND ps.section_key = 'plans'
  AND ps.body_en = 'Partiva offers several subscription plans — Free Trial, Basic, Professional, and Enterprise — priced in Saudi Riyals on the Pricing page. Custom plans are also available for businesses with special requirements by contacting us.';

UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.title_ar = 'تعديل شروط العمولة', ps.title_en = 'Changes to Commission Terms',
    ps.body_ar = 'قد تُحدَّث Partiva شرائح العمولة أو تفاصيل الفترة المجانية من وقت لآخر وفق الشروط التجارية المعمول بها. يُطبَّق أي تحديث على المعاملات التالية لتاريخ سريانه.',
    ps.body_en = 'Partiva may update the commission tiers or free-period details from time to time in line with its applicable commercial terms. Any update applies to transactions from its effective date onward.'
WHERE p.slug = 'terms' AND ps.section_key = 'changes'
  AND ps.body_en = 'You can change your subscription plan at any time. When you change plans, the new plan''s limits are applied immediately.';

UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.title_ar = 'الفترة المجانية', ps.title_en = 'Free Launch Period',
    ps.body_ar = 'لا تعتمد Partiva على تجربة مجانية محدودة المدة قبل الاشتراك. بدلًا من ذلك، أول 100 قطعة ناجحة أو أول 90 يومًا من تفعيل الحساب بدون عمولة، أيهما يأتي أولًا. راجع صفحة الأسعار للتفاصيل الكاملة.',
    ps.body_en = 'Partiva does not offer a time-limited free trial before a subscription starts. Instead, your first 100 successful parts or your first 90 days from account activation are commission-free, whichever comes first. See the Pricing page for full details.'
WHERE p.slug = 'terms' AND ps.section_key = 'trial'
  AND ps.body_en = 'Partiva offers a free trial with no credit card required, and you can cancel at any time. See the Pricing page for the current trial details.';

UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.title_ar = 'لا رسوم مقدمة', ps.title_en = 'No Upfront Fees',
    ps.body_ar = 'لا تفرض Partiva أي رسوم مقدمة عند التسجيل أو التفعيل، وبالتالي لا يوجد مبلغ اشتراك يستوجب استرجاعه. أي مسائل متعلقة بالمعاملات تخضع للشروط التجارية المعمول بها لدى Partiva.',
    ps.body_en = 'Partiva does not charge any upfront fees for registration or activation, so there is no subscription payment to refund. Any transaction-related matters are governed by Partiva''s applicable commercial terms.'
WHERE p.slug = 'terms' AND ps.section_key = 'refund'
  AND ps.body_en = 'Partiva offers a full refund guarantee within 14 days of payment.';

-- Two more live page_sections rows mention the old "choose a subscription
-- plan" step, both made stale by RegisterContent.tsx's registration form no
-- longer having a plan field (see the "tier" field removal in this same
-- release): the /how-it-works page's step 1 description, and the Privacy
-- Policy's description of what registration collects. REPLACE() only
-- touches the exact stale clause -- a no-op if it's already gone or was
-- edited to something else, so this is safe to run more than once.
UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.body_ar = REPLACE(ps.body_ar, 'تملى بيانات نشاطك التجاري وتختار الخطة المناسبة لك.', 'تملى بيانات نشاطك التجاري مجانًا بالكامل.'),
    ps.body_en = REPLACE(ps.body_en, 'Fill in your business details and choose the plan that fits you.', 'Fill in your business details — registration is completely free.')
WHERE p.slug = 'how-it-works' AND ps.section_key = 'steps';

UPDATE page_sections ps
JOIN pages p ON p.id = ps.page_id
SET ps.body_ar = REPLACE(ps.body_ar, '، وخطة الاشتراك التي تختارها.', '.'),
    ps.body_en = REPLACE(ps.body_en, ', and the subscription plan you choose.', '.')
WHERE p.slug = 'privacy' AND ps.section_key = 'collect';

-- The two existing "الأسعار والخطط / Pricing & plans" FAQ rows (ids 5-6,
-- 005_seed_roles.sql's neighbor 016_create_faqs.sql) describe the OLD
-- subscription-plan concept ("change your plan", "plan limits") which no
-- longer applies and would misinform merchants under the new model.
-- Soft-hidden (not deleted -- historical content is preserved) so the
-- pricing page's existing FAQ query (WHERE active=TRUE) stops surfacing
-- them without touching any other FAQ category.
UPDATE faqs SET active = FALSE WHERE id IN (5, 6);

-- New FAQ content for the same category, per the SRS -- reuses the exact
-- category string already wired into the website's /pricing page FAQ
-- filter, so no frontend change is needed to surface these.
INSERT IGNORE INTO faqs (id, category_ar, category_en, question_ar, question_en, answer_ar, answer_en, display_order, active) VALUES
(101, 'الأسعار والخطط', 'Pricing & plans',
 'هل يوجد اشتراك شهري؟', 'Is there a monthly subscription?',
 'لا. Partiva لا تعتمد على اشتراك شهري للتاجر ضمن نموذج التسعير الحالي.',
 'No. Partiva does not rely on a monthly subscription for merchants under the current pricing model.',
 7, TRUE),
(102, 'الأسعار والخطط', 'Pricing & plans',
 'هل التسجيل مجاني؟', 'Is registration free?',
 'نعم.', 'Yes.',
 8, TRUE),
(103, 'الأسعار والخطط', 'Pricing & plans',
 'هل إضافة المنتجات مجانية؟', 'Is adding products free?',
 'نعم.', 'Yes.',
 9, TRUE),
(104, 'الأسعار والخطط', 'Pricing & plans',
 'متى تبدأ العمولة؟', 'When does the commission start?',
 'بعد انتهاء فترة الإعفاء: 100 قطعة ناجحة أو 90 يومًا، أيهما يأتي أولًا.',
 'After the free period ends: 100 successful parts or 90 days, whichever comes first.',
 10, TRUE),
(105, 'الأسعار والخطط', 'Pricing & plans',
 'كم تبلغ العمولة؟', 'How much is the commission?',
 'تبدأ من 2% وتنخفض حسب حجم المبيعات وفق شرائح العمولة المعتمدة.',
 'It starts at 2% and decreases based on sales volume according to the approved commission tiers.',
 11, TRUE),
(106, 'الأسعار والخطط', 'Pricing & plans',
 'هل يتم احتساب العمولة على الطلبات الملغاة؟', 'Is commission charged on canceled orders?',
 'لا، لا يتم احتساب العمولة على المعاملات التي لا تعتبر ناجحة وقابلة للعمولة وفق قواعد Partiva.',
 'No. Commission is not charged on transactions that are not considered successful and commission-eligible under Partiva''s rules.',
 12, TRUE);
