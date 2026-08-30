export type AdminUserStatus = "invited" | "active";

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string | null;
  status: AdminUserStatus;
  token_version: number;
  last_seen_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface RoleRow {
  id: number;
  name: string;
  name_ar: string | null;
  description: string | null;
  created_at: Date;
}

export interface AdminInvitationRow {
  id: number;
  user_id: number;
  role_id: number;
  token_hash: string;
  invited_by: number;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

// ---- Articles ----

export type Locale = "ar" | "en";

export type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "unpublished"
  | "archived";

export type TranslationStatus = "not_started" | "in_progress" | "complete";

/** A single inline-formatted run of text within a heading/paragraph block's
 * `runs` (produced by the dashboard's rich-text toolbar). Flat and
 * non-nested by design -- simplest representation that still supports any
 * combination of bold/italic/link on a span, safely renderable without
 * dangerouslySetInnerHTML (each mark just wraps the run in one React tag). */
export type InlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };

/** Mirrors the website's ArticleBlock union (src/app/types/article.ts) exactly --
 * content is stored and validated as this typed union, never as raw HTML/markdown.
 * `runs`/`level` are additive/optional so the 18 originally-imported articles
 * (plain `text`, no `level`) keep working unchanged -- only content edited
 * through the new rich-text toolbar populates them. */
export type ArticleBlock =
  | { type: "heading"; text: string; level?: 1 | 2 | 3 | 4 | 5 | 6; runs?: InlineRun[]; links?: { label: string; href: string }[] }
  | { type: "paragraph"; text: string; runs?: InlineRun[]; links?: { label: string; href: string }[]; callout?: boolean }
  | { type: "list"; items: string[]; ordered?: boolean; arrow?: boolean }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "flow"; steps: string[] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "image"; src: string; alt: string; width?: number; height?: number };

export interface CategoryRow {
  id: number;
  name_ar: string;
  name_en: string;
  slug: string;
  archived: boolean;
  created_at: Date;
}

export interface TagRow {
  id: number;
  name_ar: string;
  name_en: string;
  slug: string;
  archived: boolean;
  created_at: Date;
}

export interface ArticleRow {
  id: number;
  category_id: number;
  author_name: string | null;
  status: ContentStatus;
  published_at: Date | null;
  scheduled_for: Date | null;
  rejection_comment: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ArticleTranslationRow {
  id: number;
  article_id: number;
  locale: Locale;
  title: string;
  slug: string;
  excerpt: string;
  content: ArticleBlock[];
  cover_src: string | null;
  cover_alt: string | null;
  cover_width: number | null;
  cover_height: number | null;
  reading_time_minutes: number | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical: string | null;
  seo_og_title: string | null;
  seo_og_description: string | null;
  seo_robots: "index_follow" | "noindex";
  translation_status: TranslationStatus;
  created_at: Date;
  updated_at: Date;
}
