import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { TagRow } from "../../types/db.types.js";

export interface TagWithArticleCount extends TagRow {
  article_count: number;
}

export const listTags = async (): Promise<TagWithArticleCount[]> => {
  const [rows] = await pool.query<(TagWithArticleCount & RowDataPacket)[]>(
    `SELECT t.*, COUNT(at.article_id) AS article_count
     FROM tags t
     LEFT JOIN article_tags at ON at.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.name_en ASC`
  );
  return rows;
};

export const findTagById = async (id: number): Promise<TagRow | null> => {
  const [rows] = await pool.query<(TagRow & RowDataPacket)[]>("SELECT * FROM tags WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
};

export const createTag = async (input: { nameAr: string; nameEn: string; slug: string }): Promise<number> => {
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO tags (name_ar, name_en, slug) VALUES (?, ?, ?)",
    [input.nameAr, input.nameEn, input.slug]
  );
  return result.insertId;
};

export const updateTag = async (
  id: number,
  input: { nameAr: string; nameEn: string; slug: string }
): Promise<void> => {
  await pool.query("UPDATE tags SET name_ar = ?, name_en = ?, slug = ? WHERE id = ?", [
    input.nameAr,
    input.nameEn,
    input.slug,
    id,
  ]);
};

export const setTagArchived = async (id: number, archived: boolean): Promise<void> => {
  await pool.query("UPDATE tags SET archived = ? WHERE id = ?", [archived, id]);
};
