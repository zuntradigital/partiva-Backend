-- Featured/cover images are now uploaded from the admin's device and stored as
-- base64 data URLs (no external file storage was introduced). VARCHAR(500) is
-- far too small to hold one, so widen the column to accommodate them.
ALTER TABLE article_translations
  MODIFY COLUMN cover_src MEDIUMTEXT NULL;
