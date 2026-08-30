import { ApiError } from "./apiError.js";
import type { ArticleBlock } from "../types/db.types.js";

const MAX_BLOCKS = 1000;
const MAX_TEXT_LENGTH = 20000;
const MAX_ITEMS = 200;
const MAX_LINKS = 50;

function invalid(field: string): ApiError {
  return new ApiError(422, "VALIDATION_ERROR", `Invalid article content: ${field}`);
}

/** Only http(s) absolute URLs or same-site relative paths are ever rendered as
 * a clickable link -- rejects javascript:/data:/vbscript: URIs and
 * protocol-relative ("//host/...") hrefs, which browsers treat as absolute. */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length === 0 || href.length > 2000) return false;
  if (href.startsWith("//")) return false;
  if (href.startsWith("/")) return true;
  return /^https?:\/\//i.test(href);
}

// Images are now uploaded from the admin's device and stored as base64 data
// URLs, so image `src` also accepts those (raster formats only -- svg+xml is
// excluded since it can carry embedded scripts). Link hrefs (isSafeHref
// above) intentionally keep rejecting data: -- there's no legitimate case for
// a data: link, only for an image source.
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_DATA_IMAGE_LENGTH = 8_000_000; // ~6MB decoded, enough for a device photo

export function isSafeImageSrc(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  // Compared with === true (rather than a plain `if`) so TS doesn't narrow
  // `value` to `never` in the else branch -- it's already a `string` here,
  // and isSafeHref's `href is string` predicate has nothing left to add.
  if (isSafeHref(value as unknown) === true) return true;
  return value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(value);
}

function str(value: unknown, maxLen = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLen;
}

function validateLinks(links: unknown, field: string): { label: string; href: string }[] | undefined {
  if (links === undefined) return undefined;
  if (!Array.isArray(links) || links.length > MAX_LINKS) throw invalid(field);

  return links.map((link) => {
    if (typeof link !== "object" || link === null) throw invalid(field);
    const { label, href } = link as Record<string, unknown>;
    if (!str(label, 300)) throw invalid(`${field}.label`);
    if (!isSafeHref(href)) throw invalid(`${field}.href`);
    return { label, href };
  });
}

const MAX_RUNS = 500;

function validateRuns(runs: unknown, field: string): { text: string; bold?: boolean; italic?: boolean; href?: string }[] | undefined {
  if (runs === undefined) return undefined;
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > MAX_RUNS) throw invalid(field);

  return runs.map((run) => {
    if (typeof run !== "object" || run === null) throw invalid(field);
    const { text, bold, italic, href } = run as Record<string, unknown>;
    if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) throw invalid(`${field}.text`);
    if (bold !== undefined && typeof bold !== "boolean") throw invalid(`${field}.bold`);
    if (italic !== undefined && typeof italic !== "boolean") throw invalid(`${field}.italic`);
    if (href !== undefined && !isSafeHref(href)) throw invalid(`${field}.href`);
    return {
      text,
      bold: bold as boolean | undefined,
      italic: italic as boolean | undefined,
      href: href as string | undefined,
    };
  });
}

function validateLevel(level: unknown, field: string): 1 | 2 | 3 | 4 | 5 | 6 | undefined {
  if (level === undefined) return undefined;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 6) throw invalid(field);
  return level as 1 | 2 | 3 | 4 | 5 | 6;
}

function validateBlock(block: unknown, index: number): ArticleBlock {
  if (typeof block !== "object" || block === null) throw invalid(`block[${index}]`);
  const b = block as Record<string, unknown>;

  switch (b.type) {
    case "heading": {
      if (!str(b.text, 500)) throw invalid(`block[${index}].text`);
      return {
        type: "heading",
        text: b.text,
        level: validateLevel(b.level, `block[${index}].level`),
        runs: validateRuns(b.runs, `block[${index}].runs`),
        links: validateLinks(b.links, `block[${index}].links`),
      };
    }
    case "paragraph": {
      if (!str(b.text)) throw invalid(`block[${index}].text`);
      if (b.callout !== undefined && typeof b.callout !== "boolean") throw invalid(`block[${index}].callout`);
      return {
        type: "paragraph",
        text: b.text,
        runs: validateRuns(b.runs, `block[${index}].runs`),
        links: validateLinks(b.links, `block[${index}].links`),
        callout: b.callout as boolean | undefined,
      };
    }
    case "list": {
      if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > MAX_ITEMS) {
        throw invalid(`block[${index}].items`);
      }
      const items = b.items.map((item) => {
        if (!str(item, 2000)) throw invalid(`block[${index}].items`);
        return item;
      });
      if (b.ordered !== undefined && typeof b.ordered !== "boolean") throw invalid(`block[${index}].ordered`);
      if (b.arrow !== undefined && typeof b.arrow !== "boolean") throw invalid(`block[${index}].arrow`);
      return { type: "list", items, ordered: b.ordered as boolean | undefined, arrow: b.arrow as boolean | undefined };
    }
    case "table": {
      if (!Array.isArray(b.headers) || b.headers.length === 0 || b.headers.length > 30) {
        throw invalid(`block[${index}].headers`);
      }
      const headers = b.headers.map((h) => {
        if (!str(h, 200)) throw invalid(`block[${index}].headers`);
        return h;
      });
      if (!Array.isArray(b.rows) || b.rows.length > MAX_ITEMS) throw invalid(`block[${index}].rows`);
      const rows = b.rows.map((row) => {
        if (!Array.isArray(row) || row.length !== headers.length) throw invalid(`block[${index}].rows`);
        return row.map((cell) => {
          if (typeof cell !== "string" || cell.length > 2000) throw invalid(`block[${index}].rows`);
          return cell;
        });
      });
      return { type: "table", headers, rows };
    }
    case "flow": {
      if (!Array.isArray(b.steps) || b.steps.length === 0 || b.steps.length > MAX_ITEMS) {
        throw invalid(`block[${index}].steps`);
      }
      const steps = b.steps.map((step) => {
        if (!str(step, 500)) throw invalid(`block[${index}].steps`);
        return step;
      });
      return { type: "flow", steps };
    }
    case "faq": {
      if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 100) {
        throw invalid(`block[${index}].items`);
      }
      const items = b.items.map((item) => {
        if (typeof item !== "object" || item === null) throw invalid(`block[${index}].items`);
        const { q, a } = item as Record<string, unknown>;
        if (!str(q, 500) || !str(a, 5000)) throw invalid(`block[${index}].items`);
        return { q, a };
      });
      return { type: "faq", items };
    }
    case "image": {
      if (!isSafeImageSrc(b.src)) throw invalid(`block[${index}].src`);
      if (typeof b.alt !== "string" || b.alt.length > 300) throw invalid(`block[${index}].alt`);
      if (b.width !== undefined && (typeof b.width !== "number" || b.width <= 0)) throw invalid(`block[${index}].width`);
      if (b.height !== undefined && (typeof b.height !== "number" || b.height <= 0)) throw invalid(`block[${index}].height`);
      return {
        type: "image",
        src: b.src,
        alt: b.alt,
        width: b.width as number | undefined,
        height: b.height as number | undefined,
      };
    }
    default:
      throw invalid(`block[${index}].type`);
  }
}

export function validateArticleBlocks(value: unknown): ArticleBlock[] {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) {
    throw new ApiError(422, "VALIDATION_ERROR", "Article content must be an array of content blocks");
  }
  return value.map((block, index) => validateBlock(block, index));
}
