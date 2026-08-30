CREATE TABLE IF NOT EXISTS articles (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  category_id INT UNSIGNED NOT NULL,
  author_name VARCHAR(150) NULL,
  status ENUM('draft', 'review', 'approved', 'scheduled', 'published', 'unpublished', 'archived')
    NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP NULL DEFAULT NULL,
  scheduled_for TIMESTAMP NULL DEFAULT NULL,
  rejection_comment TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_articles_status (status),
  CONSTRAINT fk_articles_category FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT fk_articles_created_by FOREIGN KEY (created_by)
    REFERENCES admin_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
