import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { ArticleRow, ArticleTranslationRow, ContentStatus, Locale } from "../../types/db.types.js";

export interface ArticleWithDetails extends ArticleRow {
  category_name_ar: string;
  category_name_en: string;
  translations: Partial<Record<Locale, ArticleTranslationRow>>;
  tag_ids: number[];
}

type ArticleJoinRow = ArticleRow & { category_name_ar: string; category_name_en: string } & RowDataPacket;

async function attachTranslationsAndTags(articleRows: ArticleJoinRow[]): Promise<ArticleWithDetails[]> {
  if (articleRows.length === 0) return [];
  const ids = articleRows.map((a) => a.id);

  const [translationRows] = await pool.query<(ArticleTranslationRow & RowDataPacket)[]>(
    "SELECT * FROM article_translations WHERE article_id IN (?)",
    [ids]
  );
  const [tagRows] = await pool.query<(RowDataPacket & { article_id: number; tag_id: number })[]>(
    "SELECT article_id, tag_id FROM article_tags WHERE article_id IN (?)",
    [ids]
  );

  const translationsByArticle = new Map<number, Partial<Record<Locale, ArticleTranslationRow>>>();
  for (const t of translationRows) {
    const bucket = translationsByArticle.get(t.article_id) ?? {};
    bucket[t.locale] = t;
    translationsByArticle.set(t.article_id, bucket);
  }

  const tagsByArticle = new Map<number, number[]>();
  for (const row of tagRows) {
    const list = tagsByArticle.get(row.article_id) ?? [];
    list.push(row.tag_id);
    tagsByArticle.set(row.article_id, list);
  }

  return articleRows.map((a) => ({
    ...a,
    translations: translationsByArticle.get(a.id) ?? {},
    tag_ids: tagsByArticle.get(a.id) ?? [],
  }));
}

export const listArticlesAdmin = async (): Promise<ArticleWithDetails[]> => {
  const [articleRows] = await pool.query<ArticleJoinRow[]>(
    `SELECT a.*, c.name_ar AS category_name_ar, c.name_en AS category_name_en
     FROM articles a
     INNER JOIN categories c ON c.id = a.category_id
     ORDER BY a.updated_at DESC`
  );
  return attachTranslationsAndTags(articleRows);
};

export const findArticleByIdAdmin = async (id: number): Promise<ArticleWithDetails | null> => {
  const [articleRows] = await pool.query<ArticleJoinRow[]>(
    `SELECT a.*, c.name_ar AS category_name_ar, c.name_en AS category_name_en
     FROM articles a
     INNER JOIN categories c ON c.id = a.category_id
     WHERE a.id = ?
     LIMIT 1`,
    [id]
  );
  const [full] = await attachTranslationsAndTags(articleRows);
  return full ?? null;
};

export interface TranslationInput {
  title: string;
  slug: string;
  excerpt: string;
  content: unknown;
  coverSrc: string | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  readingTimeMinutes: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonical: string | null;
  seoOgTitle: string | null;
  seoOgDescription: string | null;
  seoRobots: "index_follow" | "noindex";
  translationStatus: "not_started" | "in_progress" | "complete";
}

export interface CreateArticleInput {
  categoryId: number;
  authorName: string | null;
  createdBy: number;
  tagIds: number[];
  translations: Partial<Record<Locale, TranslationInput>>;
}

async function upsertTranslation(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  articleId: number,
  locale: Locale,
  t: TranslationInput
): Promise<void> {
  await connection.query(
    `INSERT INTO article_translations
       (article_id, locale, title, slug, excerpt, content, cover_src, cover_alt, cover_width, cover_height,
        reading_time_minutes, seo_title, seo_description, seo_canonical, seo_og_title, seo_og_description,
        seo_robots, translation_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), slug = VALUES(slug), excerpt = VALUES(excerpt), content = VALUES(content),
       cover_src = VALUES(cover_src), cover_alt = VALUES(cover_alt),
       cover_width = VALUES(cover_width), cover_height = VALUES(cover_height),
       reading_time_minutes = VALUES(reading_time_minutes),
       seo_title = VALUES(seo_title), seo_description = VALUES(seo_description),
       seo_canonical = VALUES(seo_canonical), seo_og_title = VALUES(seo_og_title),
       seo_og_description = VALUES(seo_og_description), seo_robots = VALUES(seo_robots),
       translation_status = VALUES(translation_status)`,
    [
      articleId,
      locale,
      t.title,
      t.slug,
      t.excerpt,
      JSON.stringify(t.content),
      t.coverSrc,
      t.coverAlt,
      t.coverWidth,
      t.coverHeight,
      t.readingTimeMinutes,
      t.seoTitle,
      t.seoDescription,
      t.seoCanonical,
      t.seoOgTitle,
      t.seoOgDescription,
      t.seoRobots,
      t.translationStatus,
    ]
  );
}

export const createArticle = async (input: CreateArticleInput): Promise<number> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query<ResultSetHeader>(
      "INSERT INTO articles (category_id, author_name, created_by) VALUES (?, ?, ?)",
      [input.categoryId, input.authorName, input.createdBy]
    );
    const articleId = result.insertId;

    for (const [locale, t] of Object.entries(input.translations) as [Locale, TranslationInput][]) {
      await upsertTranslation(connection, articleId, locale, t);
    }

    if (input.tagIds.length > 0) {
      await connection.query("INSERT INTO article_tags (article_id, tag_id) VALUES ?", [
        input.tagIds.map((tagId) => [articleId, tagId]),
      ]);
    }

    await connection.commit();
    return articleId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export interface UpdateArticleInput {
  categoryId?: number;
  authorName?: string | null;
  tagIds?: number[];
  translations: Partial<Record<Locale, TranslationInput>>;
}

export const updateArticle = async (articleId: number, input: UpdateArticleInput): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (input.categoryId !== undefined || input.authorName !== undefined) {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (input.categoryId !== undefined) {
        sets.push("category_id = ?");
        values.push(input.categoryId);
      }
      if (input.authorName !== undefined) {
        sets.push("author_name = ?");
        values.push(input.authorName);
      }
      values.push(articleId);
      await connection.query(`UPDATE articles SET ${sets.join(", ")} WHERE id = ?`, values);
    }

    for (const [locale, t] of Object.entries(input.translations) as [Locale, TranslationInput][]) {
      await upsertTranslation(connection, articleId, locale, t);
    }

    if (input.tagIds !== undefined) {
      await connection.query("DELETE FROM article_tags WHERE article_id = ?", [articleId]);
      if (input.tagIds.length > 0) {
        await connection.query("INSERT INTO article_tags (article_id, tag_id) VALUES ?", [
          input.tagIds.map((tagId) => [articleId, tagId]),
        ]);
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteArticle = async (id: number): Promise<boolean> => {
  const [result] = await pool.query<ResultSetHeader>("DELETE FROM articles WHERE id = ?", [id]);
  return result.affectedRows > 0;
};

export const setArticleStatus = async (
  id: number,
  status: ContentStatus,
  extra: { rejectionComment?: string | null; scheduledFor?: Date | null; publishedAt?: Date } = {}
): Promise<void> => {
  const sets = ["status = ?"];
  const values: unknown[] = [status];

  if ("rejectionComment" in extra) {
    sets.push("rejection_comment = ?");
    values.push(extra.rejectionComment ?? null);
  }
  if ("scheduledFor" in extra) {
    sets.push("scheduled_for = ?");
    values.push(extra.scheduledFor ?? null);
  }
  if (extra.publishedAt) {
    sets.push("published_at = ?");
    values.push(extra.publishedAt);
  }

  values.push(id);
  await pool.query(`UPDATE articles SET ${sets.join(", ")} WHERE id = ?`, values);
};

// ---- Public (website) queries -- published articles only ----

export interface PublicArticleRow extends RowDataPacket {
  language: Locale;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  read_minutes: number | null;
  published_at: Date;
  cover_src: string | null;
  cover_alt: string | null;
  cover_width: number | null;
  cover_height: number | null;
  content: unknown;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical: string | null;
  seo_og_title: string | null;
  seo_og_description: string | null;
  seo_robots: string | null;
}

const PUBLIC_SELECT = `
  SELECT
    at.locale AS language,
    at.slug,
    at.title,
    at.excerpt,
    CASE WHEN at.locale = 'ar' THEN c.name_ar ELSE c.name_en END AS category,
    at.reading_time_minutes AS read_minutes,
    a.published_at,
    at.cover_src, at.cover_alt, at.cover_width, at.cover_height,
    at.content,
    at.seo_title, at.seo_description, at.seo_canonical, at.seo_og_title, at.seo_og_description, at.seo_robots
  FROM article_translations at
  INNER JOIN articles a ON a.id = at.article_id
  INNER JOIN categories c ON c.id = a.category_id
  WHERE a.status = 'published'
`;

export const listPublishedArticles = async (locale?: Locale): Promise<PublicArticleRow[]> => {
  const sql = locale ? `${PUBLIC_SELECT} AND at.locale = ? ORDER BY a.published_at DESC` : `${PUBLIC_SELECT} ORDER BY a.published_at DESC`;
  const [rows] = await pool.query<PublicArticleRow[]>(sql, locale ? [locale] : []);
  return rows;
};

export const findPublishedBySlug = async (slug: string): Promise<PublicArticleRow | null> => {
  const [rows] = await pool.query<PublicArticleRow[]>(`${PUBLIC_SELECT} AND at.slug = ? LIMIT 1`, [slug]);
  return rows[0] ?? null;
};
