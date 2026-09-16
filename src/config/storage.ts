import path from "node:path";

// Real, on-disk file storage for uploaded media (Media Library / article
// covers) -- deliberately NOT under src/ or dist/: dist/ is rebuilt (and, on
// some deploy flows, wiped) on every deploy, so anything stored inside it
// would not survive one. Resolved from process.cwd() (the project root the
// app is started from -- same assumption dotenv's default `.env` lookup
// already relies on), not __dirname, so this stays correct whether running
// from src/ via tsx or from the compiled dist/ via `node dist/server.js`.
export const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
export const MEDIA_UPLOADS_DIR = path.join(UPLOADS_ROOT, "media");

// The public, backend-relative URL prefix `media.storage_path` values use
// for a real uploaded file (as opposed to a legacy base64 data URL or a
// Website-relative seeded path) -- must match the static mount in app.ts.
export const MEDIA_UPLOADS_URL_PREFIX = "/uploads/media";
