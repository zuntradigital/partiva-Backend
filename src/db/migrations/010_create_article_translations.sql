CREATE TABLE IF NOT EXISTS article_translations (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  article_id INT UNSIGNED NOT NULL,
  locale ENUM('ar', 'en') NOT NULL,
  title VARCHAR(300) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  excerpt TEXT NOT NULL,
  -- The article body as an ArticleBlock[] JSON array (heading/paragraph/list/table/flow/faq) --
  -- matches the website's typed-block content model verbatim; never rendered via
  -- dangerouslySetInnerHTML, so this is not raw HTML/markdown.
  content JSON NOT NULL,
  cover_src VARCHAR(500) NULL,
  cover_alt VARCHAR(300) NULL,
  cover_width INT UNSIGNED NULL,
  cover_height INT UNSIGNED NULL,
  reading_time_minutes INT UNSIGNED NULL,
  seo_title VARCHAR(200) NULL,
  seo_description VARCHAR(300) NULL,
  seo_canonical VARCHAR(300) NULL,
  seo_robots ENUM('index_follow', 'noindex') NOT NULL DEFAULT 'index_follow',
  translation_status ENUM('not_started', 'in_progress', 'complete') NOT NULL DEFAULT 'not_started',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_article_translations_article_locale (article_id, locale),
  UNIQUE KEY uq_article_translations_slug (slug),
  CONSTRAINT fk_article_translations_article FOREIGN KEY (article_id)
    REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
