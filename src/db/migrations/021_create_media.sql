-- Media Library assets. `storage_path` holds either a relative Website
-- public-folder path (existing hardcoded images, seeded below -- the actual
-- files stay where they already are on the Website) or a base64 data URL
-- (new uploads from the Dashboard), matching the same storage convention
-- already used for article cover images (articles.cover_src / LONGTEXT).
CREATE TABLE IF NOT EXISTS media (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  storage_path LONGTEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_kb INT UNSIGNED NOT NULL DEFAULT 0,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  alt_ar VARCHAR(255) NOT NULL DEFAULT '',
  alt_en VARCHAR(255) NOT NULL DEFAULT '',
  uploaded_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Where a media asset is actually consumed. `route` is a pages.slug for
-- page-scoped usage, or NULL for site-wide chrome (Navbar/Footer) that
-- appears on every route. One media row can have many usage rows instead of
-- the asset being duplicated per placement.
CREATE TABLE IF NOT EXISTS media_usage (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  media_id INT UNSIGNED NOT NULL,
  route VARCHAR(100) NULL,
  section VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_media_usage_media (media_id),
  CONSTRAINT fk_media_usage_media FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeded from the Website's actual current hardcoded images
-- (partiva-website/public/images/*) -- same physical files, now registered
-- instead of duplicated. Real on-disk sizes/dimensions.
INSERT IGNORE INTO media (filename, storage_path, mime_type, size_kb, width, height, alt_ar, alt_en) VALUES
('logo.png', '/images/logo.png', 'image/png', 1021, 120, 40, 'شعار Partiva', 'Partiva logo'),
('home.jpeg', '/images/home.jpeg', 'image/jpeg', 205, 900, 650, 'واجهة منصة Partiva لإدارة الأعمال', 'Partiva business management platform interface'),
('banner.jpeg', '/images/banner.jpeg', 'image/jpeg', 260, 1536, 1024, 'واجهة منصة Partiva لإدارة الأعمال', 'Partiva business management platform interface');

INSERT INTO media_usage (media_id, route, section)
SELECT id, NULL, 'navbar' FROM media WHERE filename = 'logo.png';
INSERT INTO media_usage (media_id, route, section)
SELECT id, NULL, 'footer' FROM media WHERE filename = 'logo.png';
INSERT INTO media_usage (media_id, route, section)
SELECT id, NULL, 'article-cover-watermark' FROM media WHERE filename = 'logo.png';
INSERT INTO media_usage (media_id, route, section)
SELECT id, 'home', 'hero' FROM media WHERE filename = 'home.jpeg';
INSERT INTO media_usage (media_id, route, section)
SELECT id, 'home', 'cta' FROM media WHERE filename = 'banner.jpeg';
