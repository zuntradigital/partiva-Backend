// End-to-end test of the Media Library image cycle against a REAL running backend + REAL MySQL:
//   delete image -> removed from every article using it -> article has no image
//   -> article archived automatically -> new image added -> article back to its normal status.
//
// NOT part of `npm test` (lives outside src/__tests__/*.test.ts on purpose): it writes real rows and files.
// It refuses to run unless the database is a local scratch one, because this backend's .env points at
// production. Run it like:
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=... DB_PASSWORD=... DB_NAME=partiva_scratch \
//   BASE_URL=http://localhost:5077 ADMIN_EMAIL=... EDITOR_EMAIL=... TEST_PASSWORD=... \
//   npx tsx src/__tests__/integration/articleImageCycle.integration.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const BASE = process.env.BASE_URL ?? "http://localhost:5077";
const dbHost = process.env.DB_HOST ?? "";
const dbName = process.env.DB_NAME ?? "";
if (!["127.0.0.1", "localhost"].includes(dbHost) || !dbName.includes("scratch")) {
  console.error(`REFUSING to run: DB_HOST=${dbHost} DB_NAME=${dbName} is not a local scratch database.`);
  process.exit(2);
}
if (!BASE.startsWith("http://localhost") && !BASE.startsWith("http://127.0.0.1")) {
  console.error(`REFUSING to run against ${BASE}`);
  process.exit(2);
}

const password = process.env.TEST_PASSWORD ?? "";
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "media");

// A real, valid 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let passed = 0;
const results: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    results.push(`  PASS  ${name}`);
  } catch (e) {
    results.push(`  FAIL  ${name}\n        ${(e as Error).message}`);
    throw e;
  }
}

async function api(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, body: json };
}

async function login(email: string): Promise<string> {
  const r = await api("POST", "/api/auth/login", undefined, { email, password });
  assert.equal(r.status, 200, `login ${email}`);
  return r.body.data.token as string;
}

async function upload(token: string, name: string) {
  const form = new FormData();
  form.append("file", new Blob([PNG], { type: "image/png" }), name);
  form.append("altAr", "صورة");
  form.append("altEn", "image");
  const res = await fetch(`${BASE}/api/admin/media/upload`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  const json = (await res.json()) as any;
  assert.equal(res.status, 201, JSON.stringify(json));
  return json.data as { id: number; url: string };
}

const seo = (t: string) => ({ title: t, description: `${t} description` });
const content = (t: string) => [{ type: "paragraph", text: `Body of ${t}` }];
const translation = (title: string, slug: string, mediaId: number | null) => ({
  title, slug, excerpt: `${title} excerpt`, content: content(title), seo: seo(title),
  ...(mediaId ? { cover: { mediaId } } : {}),
});

async function main() {
  const db = await mysql.createConnection({
    host: dbHost, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: dbName,
  });
  const dbStatus = async (id: number) => {
    const [rows] = await db.query<any[]>("SELECT status, image_archived_from FROM articles WHERE id = ?", [id]);
    return rows[0] as { status: string; image_archived_from: string | null } | undefined;
  };
  const suffix = Date.now().toString(36);

  const admin = await login(process.env.ADMIN_EMAIL!);
  const editor = await login(process.env.EDITOR_EMAIL!);

  const A = await upload(admin, "image-a.png"); // the image that will be deleted
  const B = await upload(admin, "image-b.png"); // the replacement
  const fileOf = (url: string) => path.join(UPLOADS_DIR, url.split("/").pop()!);

  const mk = async (slug: string, langs: ("ar" | "en")[], mediaId: number) => {
    const translations: Record<string, unknown> = {};
    for (const l of langs) translations[l] = translation(`${slug}-${l} مقال`, `${slug}-${l}`, mediaId);
    const r = await api("POST", "/api/admin/articles", admin, { categoryId: 1, translations });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.data.id as number;
  };
  const publish = async (id: number) => {
    for (const action of ["submit_review", "approve", "publish"]) {
      const r = await api("PATCH", `/api/admin/articles/${id}/status`, admin, { action });
      assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.body)}`);
    }
  };

  // X: published, both languages use image A.  Y: draft, only Arabic, uses A.  Z: published, uses image B (must stay untouched).
  const X = await mk(`x-${suffix}`, ["ar", "en"], A.id);
  await publish(X);
  const Y = await mk(`y-${suffix}`, ["ar"], A.id);
  const Z = await mk(`z-${suffix}`, ["ar", "en"], B.id);
  await publish(Z);

  await step("setup: published article X is visible on the public API with image A; the file is on disk and served", async () => {
    const list = await api("GET", "/api/articles?locale=ar");
    const x = list.body.data.find((a: any) => a.slug === `x-${suffix}-ar`);
    assert.ok(x, "X must be public");
    assert.equal(x.cover.src, A.url);
    assert.equal(fs.existsSync(fileOf(A.url)), true);
    assert.equal((await fetch(`${BASE}${A.url}`)).status, 200);
  });

  await step("RBAC: a user without media:delete cannot delete (403) and nothing changes", async () => {
    const r = await api("DELETE", `/api/admin/media/${A.id}`, editor);
    assert.equal(r.status, 403);
    assert.equal(fs.existsSync(fileOf(A.url)), true);
    assert.equal((await dbStatus(X))!.status, "published");
    const [rows] = await db.query<any[]>("SELECT COUNT(*) n FROM media WHERE id = ?", [A.id]);
    assert.equal(rows[0].n, 1);
  });

  const beforeX = (await api("GET", `/api/admin/articles/${X}`, admin)).body.data;

  await step("1. DELETE image A is NOT blocked although published article X and draft article Y use it", async () => {
    const r = await api("DELETE", `/api/admin/media/${A.id}`, admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.articleImagesRemoved, 3); // X ar + X en + Y ar
    assert.equal(r.body.data.articlesArchived, 2); // X and Y
  });

  await step("media record gone from the Library, stored file gone from disk and no longer served", async () => {
    const list = await api("GET", "/api/admin/media", admin);
    assert.ok(!list.body.data.some((m: any) => m.id === A.id));
    const [rows] = await db.query<any[]>("SELECT COUNT(*) n FROM media WHERE id = ?", [A.id]);
    assert.equal(rows[0].n, 0);
    assert.equal(fs.existsSync(fileOf(A.url)), false);
    assert.equal((await fetch(`${BASE}${A.url}`)).status, 404);
    assert.ok(!(await api("GET", "/api/media")).body.data.some((m: any) => m.id === A.id), "public media API must not list it");
  });

  await step("2+3. image removed from X and Y; article kept intact with all its content, now WITHOUT an image", async () => {
    const x = (await api("GET", `/api/admin/articles/${X}`, admin)).body.data;
    for (const l of ["ar", "en"]) {
      assert.equal(x.translations[l].cover, null, `X ${l} cover`);
      assert.deepEqual(x.translations[l].content, beforeX.translations[l].content, `X ${l} content untouched`);
      assert.equal(x.translations[l].title, beforeX.translations[l].title);
      assert.deepEqual(x.translations[l].seo, beforeX.translations[l].seo);
    }
    const y = (await api("GET", `/api/admin/articles/${Y}`, admin)).body.data;
    assert.equal(y.translations.ar.cover, null);
    const [refs] = await db.query<any[]>("SELECT COUNT(*) n FROM article_translations WHERE cover_media_id = ?", [A.id]);
    assert.equal(refs[0].n, 0, "no dangling reference to the deleted image");
  });

  await step("4. articles with no image are Archived automatically (published X and draft Y); unrelated article Z untouched", async () => {
    assert.deepEqual(await dbStatus(X), { status: "archived", image_archived_from: "published" });
    assert.deepEqual(await dbStatus(Y), { status: "archived", image_archived_from: "draft" });
    assert.deepEqual(await dbStatus(Z), { status: "published", image_archived_from: null });
    const admX = (await api("GET", `/api/admin/articles/${X}`, admin)).body.data;
    assert.equal(admX.status, "archived");
  });

  await step("website: the archived article is no longer public (list and detail), Z still is", async () => {
    const list = (await api("GET", "/api/articles?locale=ar")).body.data;
    assert.ok(!list.some((a: any) => a.slug === `x-${suffix}-ar`));
    assert.equal((await api("GET", `/api/articles/x-${suffix}-ar`)).status, 404);
    assert.ok(list.some((a: any) => a.slug === `z-${suffix}-ar`));
  });

  await step("5a. adding a new image to only ONE language keeps X archived (it still lacks an image in the other language)", async () => {
    const r = await api("PUT", `/api/admin/articles/${X}`, admin, { translations: { ar: translation(`x-${suffix}-ar مقال`, `x-${suffix}-ar`, B.id) } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, "archived");
    assert.deepEqual(await dbStatus(X), { status: "archived", image_archived_from: "published" });
  });

  await step("5b. adding a new image for every language returns X to its normal status (published) and it is public again with the new image", async () => {
    const r = await api("PUT", `/api/admin/articles/${X}`, admin, {
      translations: { ar: translation(`x-${suffix}-ar مقال`, `x-${suffix}-ar`, B.id), en: translation(`x-${suffix}-en مقال`, `x-${suffix}-en`, B.id) },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, "published", "the API response itself reports the restored status");
    assert.deepEqual(await dbStatus(X), { status: "published", image_archived_from: null });
    const pub = (await api("GET", `/api/articles/x-${suffix}-ar`)).body.data;
    assert.equal(pub.cover.src, B.url);
    assert.ok((await api("GET", "/api/articles?locale=en")).body.data.some((a: any) => a.slug === `x-${suffix}-en`));
  });

  await step("5c. draft article Y (Arabic only) returns to Draft as soon as its one language has an image again", async () => {
    const r = await api("PUT", `/api/admin/articles/${Y}`, admin, { translations: { ar: translation(`y-${suffix}-ar مقال`, `y-${suffix}-ar`, B.id) } });
    assert.equal(r.body.data.status, "draft");
    assert.deepEqual(await dbStatus(Y), { status: "draft", image_archived_from: null });
  });

  await step("an article an editor archived BY HAND is never auto-restored when it gets an image", async () => {
    const W = await mk(`w-${suffix}`, ["ar", "en"], B.id);
    await publish(W);
    assert.equal((await api("PATCH", `/api/admin/articles/${W}/status`, admin, { action: "archive" })).status, 200);
    const r = await api("PUT", `/api/admin/articles/${W}`, admin, { translations: { ar: translation(`w-${suffix}-ar مقال`, `w-${suffix}-ar`, B.id), en: translation(`w-${suffix}-en مقال`, `w-${suffix}-en`, B.id) } });
    assert.equal(r.body.data.status, "archived");
    assert.deepEqual(await dbStatus(W), { status: "archived", image_archived_from: null });
  });

  await step("repeat cycle on the new image B: delete again, archive again, restore again (cycle is repeatable)", async () => {
    const d = await api("DELETE", `/api/admin/media/${B.id}`, admin);
    assert.equal(d.status, 200);
    assert.equal((await dbStatus(X))!.status, "archived");
    const C = await upload(admin, "image-c.png");
    const r = await api("PUT", `/api/admin/articles/${X}`, admin, {
      translations: { ar: translation(`x-${suffix}-ar مقال`, `x-${suffix}-ar`, C.id), en: translation(`x-${suffix}-en مقال`, `x-${suffix}-en`, C.id) },
    });
    assert.equal(r.body.data.status, "published");
    // cleanup of what this test created
    await api("DELETE", `/api/admin/media/${C.id}`, admin);
  });

  await step("a workflow action (publish) on an auto-archived article clears the marker so it can no longer be auto-restored later", async () => {
    // X is archived again by the cleanup delete above, with marker 'published'.
    assert.deepEqual(await dbStatus(X), { status: "archived", image_archived_from: "published" });
    const D = await upload(admin, "image-d.png");
    // give it an image but bypass auto-restore by adding the image directly, then publish explicitly
    await db.query("UPDATE article_translations SET cover_src = ?, cover_media_id = ?, cover_width=1, cover_height=1 WHERE article_id = ?", [D.url, D.id, X]);
    const r = await api("PATCH", `/api/admin/articles/${X}/status`, admin, { action: "publish" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await dbStatus(X), { status: "published", image_archived_from: null });
    await api("DELETE", `/api/admin/media/${D.id}`, admin);
  });

  await db.end();
  console.log(results.join("\n"));
  console.log(`\n${passed} steps passed`);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error("\nCYCLE TEST FAILED:", e);
  process.exit(1);
});
