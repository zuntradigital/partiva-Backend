// Media deletion (Media Library "Delete image"). Runs against an in-memory fake
// of the tables involved -- NEVER the real MySQL (this backend's .env points at
// the live production database, so a destructive test must not touch it). The
// full delete -> archive -> new image -> restore cycle against a real MySQL is in
// src/__tests__/integration/articleImageCycle.integration.ts (scratch DB only).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { deleteMediaAsset, type MediaDb } from "../modules/media/media.routes.js";
import { ApiError } from "../utils/apiError.js";
import { MEDIA_UPLOADS_DIR, MEDIA_UPLOADS_URL_PREFIX } from "../config/storage.js";

type Translation = {
  id: number; article_id: number; locale: "ar" | "en"; title: string;
  cover_media_id: number | null; cover_src: string | null; cover_alt: string | null; cover_width: number | null; cover_height: number | null;
};
type State = {
  media: { id: number; storage_path: string }[];
  media_usage: { id: number; media_id: number; route: string | null; section: string }[];
  articles: { id: number; status: string; image_archived_from: string | null }[];
  article_translations: Translation[];
};

function makeDb(initial: State, opts: { failOnMediaDelete?: boolean; missingMarkerColumn?: boolean } = {}) {
  let state: State = structuredClone(initial);
  let snapshot: State | null = null;

  const run = async (sql: string, params: unknown[] = []): Promise<[any, any]> => {
    const first = params[0];
    if (sql.startsWith("SELECT * FROM media WHERE id")) return [state.media.filter((m) => m.id === first), null];
    if (sql.includes("FROM media_usage mu")) {
      return [state.media_usage.filter((u) => u.media_id === first).map((u) => ({ ...u, title_ar: null, title_en: null })), null];
    }
    if (sql.includes("FROM article_translations at INNER JOIN articles a")) {
      const byPath = params[1] as string | undefined;
      const rows = state.article_translations
        .filter((t) => t.cover_media_id === first || (byPath !== undefined && t.cover_src === byPath))
        .map((t) => ({ id: t.id, article_id: t.article_id, status: state.articles.find((a) => a.id === t.article_id)!.status }));
      return [rows, null];
    }
    if (sql.startsWith("UPDATE article_translations")) {
      const ids = first as number[];
      for (const t of state.article_translations) {
        if (ids.includes(t.id)) Object.assign(t, { cover_media_id: null, cover_src: null, cover_alt: null, cover_width: null, cover_height: null });
      }
      return [{ affectedRows: ids.length }, null];
    }
    if (sql.startsWith("UPDATE articles SET image_archived_from = status")) {
      if (opts.missingMarkerColumn) {
        throw Object.assign(new Error("Unknown column 'image_archived_from' in 'field list'"), { code: "ER_BAD_FIELD_ERROR" });
      }
      const ids = first as number[];
      let n = 0;
      for (const a of state.articles) {
        if (ids.includes(a.id) && a.status !== "archived") {
          a.image_archived_from = a.status; // left-to-right SET semantics, as in MySQL
          a.status = "archived";
          n++;
        }
      }
      return [{ affectedRows: n }, null];
    }
    if (sql.startsWith("DELETE FROM media_usage")) {
      state.media_usage = state.media_usage.filter((u) => u.media_id !== first);
      return [{ affectedRows: 1 }, null];
    }
    if (sql.startsWith("DELETE FROM media WHERE")) {
      if (opts.failOnMediaDelete) throw new Error("simulated database failure");
      state.media = state.media.filter((m) => m.id !== first);
      return [{ affectedRows: 1 }, null];
    }
    throw new Error(`unexpected SQL in test fake: ${sql}`);
  };

  const db: MediaDb = {
    query: run,
    getConnection: async () => ({
      query: run,
      beginTransaction: async () => { snapshot = structuredClone(state); },
      commit: async () => { snapshot = null; },
      rollback: async () => { if (snapshot) state = snapshot; snapshot = null; },
      release: () => {},
    }),
  };
  return { db, get state() { return state; } };
}

const emptyState = (): State => ({ media: [], media_usage: [], articles: [], article_translations: [] });
const tr = (over: Partial<Translation>): Translation => ({
  id: 1, article_id: 10, locale: "ar", title: "عنوان المقال",
  cover_media_id: 7, cover_src: "/uploads/media/a.jpg", cover_alt: "alt", cover_width: 800, cover_height: 600, ...over,
});

function recorder() {
  const removed: string[] = [];
  return { removed, removeStoredFile: async (p: string) => { removed.push(p); } };
}

describe("deleteMediaAsset — deletion is never blocked", () => {
  test("an unknown asset is a 404 and nothing is touched", async () => {
    const fake = makeDb(emptyState());
    const rec = recorder();
    await assert.rejects(deleteMediaAsset(fake.db, 99, rec), (e: unknown) => e instanceof ApiError && e.statusCode === 404);
    assert.deepEqual(rec.removed, []);
  });

  test("an unused asset: row deleted, stored file removed, nothing else changes", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    const fake = makeDb(s);
    const rec = recorder();
    const result = await deleteMediaAsset(fake.db, 7, rec);
    assert.deepEqual(result, { id: 7, removedUsages: 0, articleImagesRemoved: 0, articlesArchived: 0 });
    assert.equal(fake.state.media.length, 0);
    assert.deepEqual(rec.removed, ["/uploads/media/a.jpg"]);
  });

  test("an asset used by a page section is deleted (NOT refused): the placement goes with it, the other asset is untouched", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" }, { id: 8, storage_path: "/uploads/media/b.jpg" });
    s.media_usage.push({ id: 1, media_id: 7, route: "home", section: "hero" }, { id: 2, media_id: 7, route: null, section: "navbar" }, { id: 3, media_id: 8, route: "home", section: "cta" });
    const fake = makeDb(s);
    const rec = recorder();
    const result = await deleteMediaAsset(fake.db, 7, rec);
    assert.equal(result.removedUsages, 2);
    assert.deepEqual(fake.state.media.map((m) => m.id), [8]);
    assert.deepEqual(fake.state.media_usage.map((u) => u.id), [3]);
    assert.deepEqual(rec.removed, ["/uploads/media/a.jpg"]);
  });
});

describe("deleteMediaAsset — article images: remove, keep the article, archive it", () => {
  for (const status of ["draft", "review", "approved", "scheduled", "published", "unpublished"]) {
    test(`a ${status} article using the image: image removed, content kept, article moved to Archived remembering "${status}"`, async () => {
      const s = emptyState();
      s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
      s.articles.push({ id: 10, status, image_archived_from: null });
      s.article_translations.push(tr({}));
      const fake = makeDb(s);
      const rec = recorder();
      const result = await deleteMediaAsset(fake.db, 7, rec);

      assert.equal(result.articleImagesRemoved, 1);
      assert.equal(result.articlesArchived, 1);
      const t = fake.state.article_translations[0]!;
      assert.deepEqual([t.cover_media_id, t.cover_src, t.cover_alt, t.cover_width, t.cover_height], [null, null, null, null, null]);
      assert.equal(t.title, "عنوان المقال", "the article's content must be untouched");
      assert.equal(fake.state.articles.length, 1, "the article must not be deleted");
      assert.equal(fake.state.articles[0]!.status, "archived");
      assert.equal(fake.state.articles[0]!.image_archived_from, status);
      assert.deepEqual(rec.removed, ["/uploads/media/a.jpg"]);
    });
  }

  test("an article that was ALREADY archived by hand: image removed, stays archived, no restore marker is set", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    s.articles.push({ id: 10, status: "archived", image_archived_from: null });
    s.article_translations.push(tr({}));
    const fake = makeDb(s);
    const result = await deleteMediaAsset(fake.db, 7, recorder());
    assert.equal(result.articleImagesRemoved, 1);
    assert.equal(result.articlesArchived, 0);
    assert.equal(fake.state.articles[0]!.status, "archived");
    assert.equal(fake.state.articles[0]!.image_archived_from, null);
  });

  test("one article, two languages: only the language that used the image loses it; the article is archived once", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    s.articles.push({ id: 10, status: "published", image_archived_from: null });
    s.article_translations.push(tr({ id: 1, locale: "ar" }), tr({ id: 2, locale: "en", cover_media_id: 9, cover_src: "/uploads/media/other.jpg" }));
    const fake = makeDb(s);
    const result = await deleteMediaAsset(fake.db, 7, recorder());
    assert.equal(result.articlesArchived, 1);
    assert.equal(fake.state.article_translations[0]!.cover_src, null);
    assert.equal(fake.state.article_translations[1]!.cover_src, "/uploads/media/other.jpg", "the other language's image is untouched");
    assert.equal(fake.state.articles[0]!.image_archived_from, "published");
  });

  test("several articles using the same image are all handled; an article using a different image is untouched", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    s.articles.push({ id: 10, status: "published", image_archived_from: null }, { id: 11, status: "draft", image_archived_from: null }, { id: 12, status: "published", image_archived_from: null });
    s.article_translations.push(
      tr({ id: 1, article_id: 10 }), tr({ id: 2, article_id: 11 }),
      tr({ id: 3, article_id: 12, cover_media_id: 9, cover_src: "/uploads/media/other.jpg" })
    );
    const fake = makeDb(s);
    const result = await deleteMediaAsset(fake.db, 7, recorder());
    assert.equal(result.articlesArchived, 2);
    assert.deepEqual(fake.state.articles.map((a) => a.status), ["archived", "archived", "published"]);
    assert.equal(fake.state.article_translations[2]!.cover_src, "/uploads/media/other.jpg");
  });

  test("a legacy article that stored the upload's path but no media id is treated as using it (no stale link to a deleted file)", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    s.articles.push({ id: 10, status: "published", image_archived_from: null });
    s.article_translations.push(tr({ cover_media_id: null, cover_src: "/uploads/media/a.jpg" }));
    const fake = makeDb(s);
    const result = await deleteMediaAsset(fake.db, 7, recorder());
    assert.equal(result.articlesArchived, 1);
    assert.equal(fake.state.article_translations[0]!.cover_src, null);
  });

  test("a database failure mid-delete rolls EVERYTHING back (cover, article status, usage, row) and the stored file is NOT deleted", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    s.media_usage.push({ id: 1, media_id: 7, route: "home", section: "hero" });
    s.articles.push({ id: 10, status: "published", image_archived_from: null });
    s.article_translations.push(tr({}));
    const fake = makeDb(s, { failOnMediaDelete: true });
    const rec = recorder();
    await assert.rejects(deleteMediaAsset(fake.db, 7, rec), /simulated database failure/);
    assert.equal(fake.state.media.length, 1);
    assert.equal(fake.state.media_usage.length, 1);
    assert.equal(fake.state.articles[0]!.status, "published");
    assert.equal(fake.state.articles[0]!.image_archived_from, null);
    assert.equal(fake.state.article_translations[0]!.cover_src, "/uploads/media/a.jpg");
    assert.deepEqual(rec.removed, []);
  });
});

describe("deleteMediaAsset — a database whose migration 038 has not run yet", () => {
  test("deleting images used by a published article fails with an explicit MIGRATION_REQUIRED error (not a generic 500) and changes NOTHING", async () => {
    const s = emptyState();
    s.media.push({ id: 44, storage_path: "/uploads/media/one.png" }, { id: 45, storage_path: "/uploads/media/two.png" });
    s.articles.push({ id: 29, status: "published", image_archived_from: null });
    s.article_translations.push(
      tr({ id: 534, article_id: 29, locale: "ar", cover_media_id: 45, cover_src: "/uploads/media/two.png" }),
      tr({ id: 535, article_id: 29, locale: "en", cover_media_id: 44, cover_src: "/uploads/media/one.png" })
    );
    const fake = makeDb(s, { missingMarkerColumn: true });
    const rec = recorder();
    for (const id of [44, 45]) {
      await assert.rejects(deleteMediaAsset(fake.db, id, rec), (e: unknown) => e instanceof ApiError && e.statusCode === 503 && e.errorCode === "MIGRATION_REQUIRED");
    }
    assert.equal(fake.state.media.length, 2, "media rows untouched");
    assert.equal(fake.state.articles[0]!.status, "published");
    assert.deepEqual(fake.state.article_translations.map((t) => t.cover_media_id), [45, 44], "article covers untouched");
    assert.deepEqual(rec.removed, [], "no stored file removed");
  });

  test("an unused image still deletes normally on such a database (the marker column is only needed when an article uses the image)", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: "/uploads/media/a.jpg" });
    const fake = makeDb(s, { missingMarkerColumn: true });
    await deleteMediaAsset(fake.db, 7, recorder());
    assert.equal(fake.state.media.length, 0);
  });
});

describe("stored file removal (default remover)", () => {
  test("a stored file that is ALREADY MISSING does not break deletion: the database record is still removed cleanly", async () => {
    const s = emptyState();
    s.media.push({ id: 7, storage_path: `${MEDIA_UPLOADS_URL_PREFIX}/does-not-exist-${crypto.randomUUID()}.png` });
    const fake = makeDb(s);
    const result = await deleteMediaAsset(fake.db, 7);
    assert.equal(result.id, 7);
    assert.equal(fake.state.media.length, 0);
  });

  test("a real uploaded file is physically deleted; a Website-relative seeded path is never touched", async () => {
    fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });
    const name = `test-${crypto.randomUUID()}.jpg`;
    const abs = path.join(MEDIA_UPLOADS_DIR, name);
    fs.writeFileSync(abs, "x");
    assert.equal(fs.existsSync(abs), true);

    const s = emptyState();
    s.media.push({ id: 7, storage_path: `${MEDIA_UPLOADS_URL_PREFIX}/${name}` }, { id: 8, storage_path: "/images/logo.png" });
    const fake = makeDb(s);
    await deleteMediaAsset(fake.db, 7);
    assert.equal(fs.existsSync(abs), false, "the uploaded file must be gone from storage");

    await deleteMediaAsset(fake.db, 8); // seeded website path: the row goes, the Website's own file is not ours to delete
    assert.equal(fake.state.media.length, 0);
  });

  test("a path that tries to escape the uploads directory is ignored", async () => {
    const outside = path.join(MEDIA_UPLOADS_DIR, "..", `keep-${crypto.randomUUID()}.txt`);
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, "keep");
    try {
      const s = emptyState();
      s.media.push({ id: 7, storage_path: `${MEDIA_UPLOADS_URL_PREFIX}/../${path.basename(outside)}` });
      const fake = makeDb(s);
      await deleteMediaAsset(fake.db, 7);
      assert.equal(fs.existsSync(outside), true);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});
