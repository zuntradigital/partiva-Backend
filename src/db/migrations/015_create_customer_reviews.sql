CREATE TABLE IF NOT EXISTS customer_reviews (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name_ar VARCHAR(150) NOT NULL,
  name_en VARCHAR(150) NULL,
  role_ar VARCHAR(200) NOT NULL,
  role_en VARCHAR(200) NULL,
  quote_ar TEXT NOT NULL,
  quote_en TEXT NULL,
  rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
  image_src MEDIUMTEXT NULL,
  display_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_customer_reviews_active_order (active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO customer_reviews (id, name_ar, name_en, role_ar, role_en, quote_ar, quote_en, rating, display_order, active) VALUES
(1, 'أحمد القحطاني', 'Ahmed Al-Qahtani', 'متجر قطع الغيار الذكي', 'Smart Spare Parts Store',
 'منصة ممتازة وسهلة الاستخدام، ساعدتنا على تنظيم مخزوننا وزيادة مبيعاتنا بشكل ملحوظ.',
 'An excellent, easy-to-use platform that helped us organize inventory and increase sales significantly.',
 5, 1, TRUE),
(2, 'سلمان العتيبي', 'Salman Al-Otaibi', 'شركة مسار القطع', 'Masar Parts Company',
 'التقارير دقيقة والدعم الفني سريع. أنصح بها لكل صاحب عمل في مجال قطع الغيار.',
 'The reports are accurate and support is fast. I recommend it to every auto-parts business owner.',
 5, 2, TRUE),
(3, 'محمد الشهري', 'Mohammed Al-Shahri', 'ورشة النخبة', 'Elite Workshop',
 'أفضل نظام استخدمناه لإدارة أعمالنا، وفر علينا الكثير من الوقت والجهد.',
 'The best system we have used to manage our business; it saved us considerable time and effort.',
 5, 3, TRUE);
