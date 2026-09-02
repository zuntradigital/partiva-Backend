-- Three "الأسعار والخطط / Pricing & plans" FAQ rows describe the old
-- Basic/Professional/Enterprise subscription plans by name (added later via
-- the Dashboard's FAQ admin, so they weren't part of 016_create_faqs.sql's
-- original seed and were missed by 031's cleanup of ids 5-6). Per explicit
-- instruction, these are removed entirely rather than soft-hidden -- unlike
-- 031's ids 5-6, this content is not being preserved as history.
-- Guarded on question_en to avoid deleting unrelated rows if these ids are
-- ever reused.
DELETE FROM faqs
WHERE id = 21 AND question_en = 'Is there a custom Enterprise plan?';

DELETE FROM faqs
WHERE id = 36 AND question_en = 'What''s the difference between the plans?';

DELETE FROM faqs
WHERE id = 37 AND question_en = 'Which plan suits my business?';
