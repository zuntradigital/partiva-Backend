/**
 * One-time backfill: converts legacy inline base64 `cover_src` values on
 * article_translations (from the pre-Media-Library era -- see migration
 * 013_widen_cover_src.sql) into real files under uploads/media, exactly the
 * way POST /api/admin/media/upload already stores a new cover today. Fixes
 * the actual root cause of the Blog page's slow load: these rows were
 * embedding ~300-650KB of base64 image data directly in every API response
 * (list AND detail) instead of a short URL, which `mapToPublicResponse` /
 * `mapTranslation` (articles.service.ts) just pass through unchanged either
 * way -- no application code needs to change for this to take effect.
 *
 * Safe to re-run: only rows whose cover_src still starts with "data:image/"
 * are touched, so already-migrated rows are skipped automatically.
 *
 * Usage: npm run backfill-cover-media
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../config/database.js";
import { MEDIA_UPLOADS_DIR, MEDIA_UPLOADS_URL_PREFIX } from "../config/storage.js";

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|avif);base64,([A-Za-z0-9+/=]+)$/;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

type Row = RowDataPacket & {
  id: number;
  article_id: number;
  locale: "ar" | "en";
  cover_src: string;
  cover_alt: string | null;
  title: string;
};

async function run() {
  fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });

  const [rows] = await pool.query<Row[]>(
    `SELECT id, article_id, locale, cover_src, cover_alt, title
     FROM article_translations
     WHERE cover_src LIKE 'data:image/%'`
  );

  console.log(`Found ${rows.length} legacy base64 cover(s) to migrate.`);

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const label = `article_translations#${row.id} (article ${row.article_id}/${row.locale}, "${row.title}")`;
    try {
      const match = DATA_URL_RE.exec(row.cover_src);
      if (!match) {
        console.warn(`SKIP ${label}: cover_src is not a recognized image data URL`);
        failed++;
        continue;
      }
      const mimeType = `image/${match[1] === "jpg" ? "jpeg" : match[1]}`;
      const buffer = Buffer.from(match[2], "base64");

      let dimensions: { width?: number; height?: number };
      try {
        dimensions = imageSize(buffer);
      } catch {
        console.warn(`SKIP ${label}: not a valid image`);
        failed++;
        continue;
      }

      const ext = MIME_TO_EXT[mimeType] ?? "bin";
      const storedFilename = `${crypto.randomUUID()}.${ext}`;
      const absolutePath = path.join(MEDIA_UPLOADS_DIR, storedFilename);
      const storagePath = `${MEDIA_UPLOADS_URL_PREFIX}/${storedFilename}`;
      const sizeKb = Math.round(buffer.length / 1024);
      const alt = (row.cover_alt ?? "").trim();

      await fs.promises.writeFile(absolutePath, buffer);

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [inserted] = await connection.query<ResultSetHeader>(
          `INSERT INTO media (filename, storage_path, mime_type, size_kb, width, height, alt_ar, alt_en, uploaded_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            storedFilename,
            storagePath,
            mimeType,
            sizeKb,
            dimensions.width ?? null,
            dimensions.height ?? null,
            row.locale === "ar" ? alt : "",
            row.locale === "en" ? alt : "",
            "backfill-cover-media script",
          ]
        );
        await connection.query(
          `UPDATE article_translations
           SET cover_src = ?, cover_media_id = ?, cover_width = ?, cover_height = ?
           WHERE id = ?`,
          [storagePath, inserted.insertId, dimensions.width ?? null, dimensions.height ?? null, row.id]
        );
        await connection.commit();
        console.log(`OK   ${label}: ${row.cover_src.length} chars -> ${storagePath} (media #${inserted.insertId}, ${sizeKb}KB)`);
        migrated++;
      } catch (error) {
        await connection.rollback();
        await fs.promises.unlink(absolutePath).catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error(`FAIL ${label}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log(`Done. Migrated: ${migrated}, failed/skipped: ${failed}.`);
  await pool.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
