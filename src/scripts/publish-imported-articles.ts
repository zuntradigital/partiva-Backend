/**
 * One-time companion to partiva-website/scripts/import-articles-to-backend.ts.
 *
 * That script creates articles as drafts via the real admin API (so full
 * validation runs). This backfills status=published with the ORIGINAL
 * publish date (2026-08-17) that the website's static data recorded --
 * the workflow's normal "publish" action always stamps published_at with
 * the current time, which would lose that historical date.
 *
 * Usage: npm run publish-imported -- <articleId> <articleId> ...
 */
import pool from "../config/database.js";

const ids = process.argv.slice(2).map(Number);

if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
  console.error("Usage: npm run publish-imported -- <articleId> <articleId> ...");
  process.exit(1);
}

const ORIGINAL_PUBLISHED_AT = "2026-08-17 00:00:00";

const run = async () => {
  const [result] = await pool.query(
    `UPDATE articles SET status = 'published', published_at = ? WHERE id IN (?)`,
    [ORIGINAL_PUBLISHED_AT, ids]
  );
  console.log("Updated:", result);
  await pool.end();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
