-- Singleton row (id is always 1) -- the site has exactly one set of contact
-- details, matching how it's already modeled on both the Website and the
-- Dashboard's existing ContactInfo type (no list of multiple entries).
CREATE TABLE IF NOT EXISTS contact_info (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  whatsapp_number VARCHAR(50) NULL,
  whatsapp_link VARCHAR(500) NULL,
  website_url VARCHAR(500) NULL,
  email VARCHAR(255) NULL,
  address_ar VARCHAR(500) NULL,
  address_en VARCHAR(500) NULL,
  location_ar VARCHAR(255) NULL,
  location_en VARCHAR(255) NULL,
  social_links JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_contact_info_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeded from the values currently hard-coded on the Website (Footer.tsx +
-- contact/page.tsx), preserved verbatim -- including the Footer's address
-- having no real English translation (falls back to Arabic, as it already
-- does today) and the social links being unimplemented "#" placeholders.
INSERT IGNORE INTO contact_info
  (id, whatsapp_number, whatsapp_link, website_url, email, address_ar, address_en, location_ar, location_en, social_links)
VALUES
  (1, '+966 59 084 3000', 'https://wa.me/966590843000', 'https://partiva.tech/', NULL,
   'مركز قريش التجارى _ تقاطع طريق المدينه مع شارع قريش', NULL,
   'الرياض، المملكة العربية السعودية', 'Riyadh, Saudi Arabia',
   JSON_ARRAY(
     JSON_OBJECT('id', 'soc-1', 'platform', 'LinkedIn', 'url', '#'),
     JSON_OBJECT('id', 'soc-2', 'platform', 'Twitter', 'url', '#'),
     JSON_OBJECT('id', 'soc-3', 'platform', 'YouTube', 'url', '#'),
     JSON_OBJECT('id', 'soc-4', 'platform', 'Facebook', 'url', '#')
   ));
