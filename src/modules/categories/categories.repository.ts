import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../../config/database.js";
import type { CategoryRow } from "../../types/db.types.js";

export interface CategoryWithArticleCount extends CategoryRow {
  article_count: number;
}

export const listCategories = async (): Promise<CategoryWithArticleCount[]> => {
  const [rows] = await pool.query<(CategoryWithArticleCount & RowDataPacket)[]>(
    `SELECT c.*, COUNT(a.id) AS article_count
     FROM categories c
     LEFT JOIN articles a ON a.category_id = c.id
     GROUP BY c.id
     ORDER BY c.name_en ASC`
  );
  return rows;
};

export const findCategoryById = async (id: number): Promise<CategoryRow | null> => {
  const [rows] = await pool.query<(CategoryRow & RowDataPacket)[]>(
    "SELECT * FROM categories WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
};

export const createCategory = async (input: {
  nameAr: string;
  nameEn: string;
  slug: string;
}): Promise<number> => {
  const [result] = await pool.query<ResultSetHeader>(
    "INSERT INTO categories (name_ar, name_en, slug) VALUES (?, ?, ?)",
    [input.nameAr, input.nameEn, input.slug]
  );
  return result.insertId;
};

export const updateCategory = async (
  id: number,
  input: { nameAr: string; nameEn: string; slug: string }
): Promise<void> => {
  await pool.query("UPDATE categories SET name_ar = ?, name_en = ?, slug = ? WHERE id = ?", [
    input.nameAr,
    input.nameEn,
    input.slug,
    id,
  ]);
};

export const setCategoryArchived = async (id: number, archived: boolean): Promise<void> => {
  await pool.query("UPDATE categories SET archived = ? WHERE id = ?", [archived, id]);
};
