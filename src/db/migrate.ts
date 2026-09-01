import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Migrations here rely on idempotent SQL (CREATE TABLE IF NOT EXISTS, INSERT
// IGNORE) to be safely re-runnable. MySQL has no `ADD COLUMN IF NOT EXISTS`,
// so a plain ALTER's "already applied" error is treated as a no-op instead.
const ALREADY_APPLIED_ERROR_CODES = new Set(["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"]);

// Before this table existed, every run replayed every file from scratch.
// That's not actually safe once a later migration renames/deletes rows a
// prior INSERT IGNORE seeded by name (see 005/022/027's roles saga): the
// second full replay finds the old names free again, re-inserts them as
// duplicates, and the rename migration then collides with names it already
// produced last time -- a plain ER_DUP_ENTRY, which isn't in the "already
// applied" allowlist above, so the run aborts before ever reaching the
// migration meant to clean it up. Tracking which files already ran makes
// every migration -- not just this one -- execute at most once, ever.
const TRACKING_TABLE = "schema_migrations";

// Bootstrap cutoff: every file at/under this one was already applied to
// every environment before this tracking table existed, so its cumulative
// effect (bugs included, e.g. the duplicate legacy roles) is already in
// the DB -- backfilling them as "applied" avoids replaying 29 files (and
// re-triggering the exact bug this exists to stop) on the first run with
// tracking. Only files sorting after this name are new enough to need
// their SQL to actually execute.
const BOOTSTRAP_CUTOFF = "029_add_token_version.sql";

const runMigrations = async () => {
  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    multipleStatements: true,
  });

  try {
    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [TRACKING_TABLE]
    );
    const trackingTableIsNew = existing[0].c === 0;

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (trackingTableIsNew) {
      const baseline = files.filter((file) => file <= BOOTSTRAP_CUTOFF);
      for (const file of baseline) {
        await connection.query(`INSERT IGNORE INTO ${TRACKING_TABLE} (filename) VALUES (?)`, [file]);
      }
      console.log(`Tracking table created; backfilled ${baseline.length} pre-existing migration(s) as already applied.`);
    }

    const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(`SELECT filename FROM ${TRACKING_TABLE}`);
    const applied = new Set(appliedRows.map((row) => row.filename as string));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping (already applied): ${file}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(filePath, "utf-8");

      console.log(`Applying migration: ${file}`);
      try {
        await connection.query(sql);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (!code || !ALREADY_APPLIED_ERROR_CODES.has(code)) {
          throw error;
        }
        console.log(`  already applied, skipping (${code})`);
      }

      await connection.query(`INSERT INTO ${TRACKING_TABLE} (filename) VALUES (?)`, [file]);
      appliedCount++;
    }

    console.log(`Done. ${appliedCount} new migration(s) applied, ${files.length - appliedCount} already up to date.`);
  } finally {
    await connection.end();
  }
};

runMigrations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
