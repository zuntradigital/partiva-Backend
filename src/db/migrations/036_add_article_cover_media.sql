-- Links an article translation's cover image to a real, reusable row in the
-- existing `media` library (see 021_create_media.sql) instead of only
-- storing an opaque cover_src string. This is a plain many-to-one reference
-- (many article_translations rows -> one media row) -- the smallest correct
-- relationship for "an article has exactly one cover, but a media asset can
-- be reused by many articles without duplication". No join table is needed:
-- reuse is already expressed by two different rows pointing at the same
-- media_id.
--
-- cover_src/cover_alt/cover_width/cover_height are left untouched and keep
-- working exactly as before for existing rows (ON DELETE RESTRICT below,
-- plus the application-level usage check in media.routes.ts, together
-- guarantee a media row can never be deleted out from under an article that
-- still references it -- see DELETE /api/admin/media/:id).
ALTER TABLE article_translations
  ADD COLUMN cover_media_id INT UNSIGNED NULL AFTER cover_src,
  ADD CONSTRAINT fk_article_translations_cover_media
    FOREIGN KEY (cover_media_id) REFERENCES media (id) ON DELETE RESTRICT,
  ADD KEY idx_article_translations_cover_media (cover_media_id);
