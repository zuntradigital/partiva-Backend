import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateArticleBlocks, isSafeHref, isSafeImageSrc } from "../utils/articleBlocks.js";
import { ApiError } from "../utils/apiError.js";

function assertRejected(value: unknown) {
  assert.throws(() => validateArticleBlocks(value), ApiError);
}

describe("validateArticleBlocks - valid content", () => {
  test("accepts a paragraph block", () => {
    const result = validateArticleBlocks([{ type: "paragraph", text: "Hello world" }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "paragraph");
  });

  test("accepts a heading block with level and runs", () => {
    const result = validateArticleBlocks([
      { type: "heading", text: "Title", level: 2, runs: [{ text: "Title", bold: true }] },
    ]);
    assert.equal(result[0].type, "heading");
  });

  test("accepts a paragraph with a safe link", () => {
    const result = validateArticleBlocks([
      { type: "paragraph", text: "Visit us", links: [{ label: "Visit us", href: "https://example.com" }] },
    ]);
    assert.equal((result[0] as { links?: unknown[] }).links?.length, 1);
  });

  test("accepts a paragraph with runs containing an inline href", () => {
    const result = validateArticleBlocks([
      { type: "paragraph", text: "link", runs: [{ text: "link", href: "https://example.com" }] },
    ]);
    assert.equal(result.length, 1);
  });

  test("accepts a same-site relative link", () => {
    const result = validateArticleBlocks([{ type: "paragraph", text: "x", links: [{ label: "x", href: "/pricing" }] }]);
    assert.equal(result.length, 1);
  });

  test("accepts an image block with a safe https src", () => {
    const result = validateArticleBlocks([{ type: "image", src: "https://example.com/pic.png", alt: "a photo" }]);
    assert.equal(result[0].type, "image");
  });

  test("accepts an image block with a safe base64 data URL", () => {
    const result = validateArticleBlocks([
      { type: "image", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==", alt: "a photo" },
    ]);
    assert.equal(result[0].type, "image");
  });

  test("accepts a list, table, flow, and faq block", () => {
    const result = validateArticleBlocks([
      { type: "list", items: ["one", "two"] },
      { type: "table", headers: ["A", "B"], rows: [["1", "2"]] },
      { type: "flow", steps: ["step 1", "step 2"] },
      { type: "faq", items: [{ q: "Question?", a: "Answer." }] },
    ]);
    assert.equal(result.length, 4);
  });

  test("accepts an empty array (no blocks)", () => {
    assert.deepEqual(validateArticleBlocks([]), []);
  });
});

describe("validateArticleBlocks - invalid/malformed content is rejected", () => {
  test("rejects a non-array", () => {
    assertRejected({ type: "paragraph", text: "x" });
  });

  test("rejects an unknown block type", () => {
    assertRejected([{ type: "video", src: "x" }]);
  });

  test("rejects a paragraph with empty text", () => {
    assertRejected([{ type: "paragraph", text: "" }]);
  });

  test("rejects a paragraph with missing text", () => {
    assertRejected([{ type: "paragraph" }]);
  });

  test("rejects a heading with an out-of-range level", () => {
    assertRejected([{ type: "heading", text: "x", level: 9 }]);
  });

  test("rejects a link with an unsafe javascript: href", () => {
    assertRejected([{ type: "paragraph", text: "x", links: [{ label: "x", href: "javascript:alert(1)" }] }]);
  });

  test("rejects a link with a protocol-relative href", () => {
    assertRejected([{ type: "paragraph", text: "x", links: [{ label: "x", href: "//evil.example.com" }] }]);
  });

  test("rejects an image with a data: href disguised as a link", () => {
    assertRejected([{ type: "paragraph", text: "x", links: [{ label: "x", href: "data:text/html,x" }] }]);
  });

  test("rejects an image with an unsafe svg data URL", () => {
    assertRejected([{ type: "image", src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", alt: "a" }]);
  });

  test("rejects an image with a plainly invalid src", () => {
    assertRejected([{ type: "image", src: "not-a-url", alt: "a" }]);
  });

  test("rejects an image with alt text over the length limit", () => {
    assertRejected([{ type: "image", src: "https://example.com/a.png", alt: "a".repeat(301) }]);
  });

  test("rejects a list with zero items", () => {
    assertRejected([{ type: "list", items: [] }]);
  });

  test("rejects a table with mismatched row length", () => {
    assertRejected([{ type: "table", headers: ["A", "B"], rows: [["1"]] }]);
  });

  test("rejects a run with a non-boolean bold flag", () => {
    assertRejected([{ type: "paragraph", text: "x", runs: [{ text: "x", bold: "yes" }] }]);
  });

  test("rejects a block that isn't an object", () => {
    assertRejected(["just a string"]);
  });

  test("rejects null", () => {
    assertRejected(null);
  });
});

describe("isSafeHref / isSafeImageSrc", () => {
  test("isSafeHref accepts https and relative paths", () => {
    assert.equal(isSafeHref("https://example.com"), true);
    assert.equal(isSafeHref("/about"), true);
  });

  test("isSafeHref rejects javascript:, data:, and protocol-relative URLs", () => {
    assert.equal(isSafeHref("javascript:alert(1)"), false);
    assert.equal(isSafeHref("data:text/html,x"), false);
    assert.equal(isSafeHref("//evil.example.com"), false);
  });

  test("isSafeImageSrc accepts safe hrefs and base64 raster images, rejects svg", () => {
    assert.equal(isSafeImageSrc("https://example.com/a.png"), true);
    assert.equal(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo="), true);
    assert.equal(isSafeImageSrc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), false);
  });
});
