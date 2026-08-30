ALTER TABLE article_translations
  ADD COLUMN seo_og_title VARCHAR(200) NULL AFTER seo_canonical,
  ADD COLUMN seo_og_description VARCHAR(300) NULL AFTER seo_og_title;
