import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Migrations here rely on idempotent SQL (CREATE TABLE IF NOT EXISTS, INSERT
// IGNORE) to be safely re-runnable. MySQL has no `ADD COLUMN IF NOT EXISTS`,
// so a plain ALTER's "already applied" error is treated as a no-op instead.
const ALREADY_APPLIED_ERROR_CODES = new Set(["ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"]);

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
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(filePath, "utf-8");

      console.log(`Applying migration: ${file}`);
      try {
        await connection.query(sql);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code && ALREADY_APPLIED_ERROR_CODES.has(code)) {
          console.log(`  already applied, skipping (${code})`);
          continue;
        }
        throw error;
      }
    }

    console.log(`Done. Applied ${files.length} migration file(s).`);
  } finally {
    await connection.end();
  }
};

runMigrations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
