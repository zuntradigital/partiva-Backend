CREATE TABLE IF NOT EXISTS pricing_plans (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name_ar VARCHAR(200) NOT NULL, name_en VARCHAR(200) NULL,
  description_ar VARCHAR(500) NOT NULL, description_en VARCHAR(500) NULL, price DECIMAL(10,2) NOT NULL DEFAULT 0, price_label_ar VARCHAR(100) NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'SAR', billing_period VARCHAR(50) NOT NULL, features_ar JSON NOT NULL, features_en JSON NULL,
  cta_text_ar VARCHAR(200) NOT NULL, cta_text_en VARCHAR(200) NULL, cta_target VARCHAR(200) NOT NULL DEFAULT '/register',
  badge_ar VARCHAR(200) NULL, badge_en VARCHAR(200) NULL, display_order INT NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pricing_plans_public (active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS pricing_settings (setting_key VARCHAR(100) PRIMARY KEY, value JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO pricing_plans (name_ar,description_ar,price,price_label_ar,currency,billing_period,features_ar,cta_text_ar,cta_target,badge_ar,display_order,active) VALUES
('التجربة المجانية','جرب Partiva لمدة أسبوع',0,'مجاني','SAR','لمدة 7 أيام',JSON_ARRAY('تجربة مجانية لمدة أسبوع','إدارة المخزون','إدارة المبيعات والمشتريات','التقارير الأساسية'),'ابدأ تجربتك المجانية','/register',NULL,1,TRUE),
('الأساسية','للأنشطة الصغيرة',99,NULL,'SAR','شهريًا',JSON_ARRAY('مستخدم واحد','إدارة المخزون','تقارير أساسية','دعم عبر البريد'),'ابدأ الآن','/register',NULL,2,TRUE),
('الاحترافية','للأنشطة المتنامية',199,NULL,'SAR','شهريًا',JSON_ARRAY('حتى 5 مستخدمين','إدارة الفروع والمخزون','تقارير متقدمة','صلاحيات الموظفين'),'ابدأ الآن','/register','الأكثر شعبية',3,TRUE),
('المؤسسية','للشركات الكبيرة',399,NULL,'SAR','شهريًا',JSON_ARRAY('حتى 15 مستخدم','إدارة متقدمة للفروع','تحليلات وتقارير','دعم مخصص'),'ابدأ الآن','/register',NULL,4,TRUE);
INSERT INTO pricing_settings (setting_key,value) VALUES ('custom_contact',JSON_OBJECT('titleAr','محتاج خطة مخصصة؟','descriptionAr','لو نشاطك التجاري له احتياجات خاصة أو محتاج حلول مخصصة، تواصل معنا ونصمم لك الخطة المناسبة.'));
