-- Media Library "delete image" workflow: deleting an image removes it from any
-- article that used it, and an article left without an image is moved to
-- Archived automatically. This column remembers the status the article had
-- BEFORE that automatic archive, so that when a new image is added the article
-- returns exactly to that status, and so an automatic archive can be told
-- apart from an editor archiving an article by hand (a manual archive has
-- NULL here and is never auto-restored). NULL for every existing article.
ALTER TABLE articles
  ADD COLUMN image_archived_from ENUM('draft', 'review', 'approved', 'scheduled', 'published', 'unpublished') NULL AFTER status;
