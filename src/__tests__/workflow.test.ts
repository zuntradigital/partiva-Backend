import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isValidTransition, nextStatusFor, permissionRequiredFor, isWorkflowAction } from "../modules/articles/articles.workflow.js";
import type { ContentStatus } from "../types/db.types.js";

describe("content workflow - valid transitions", () => {
  test("draft -> review -> approve -> schedule -> publish -> unpublish -> archive is a valid path", () => {
    let status: ContentStatus = "draft";
    const path: [ContentStatus, "submit_review" | "approve" | "schedule" | "publish" | "unpublish" | "archive"][] = [
      ["draft", "submit_review"],
      ["review", "approve"],
      ["approved", "schedule"],
      ["scheduled", "publish"],
      ["published", "unpublish"],
      ["unpublished", "archive"],
    ];
    for (const [expectedStatus, action] of path) {
      assert.equal(status, expectedStatus);
      assert.equal(isValidTransition(status, action), true);
      status = nextStatusFor(action);
    }
    assert.equal(status, "archived");
  });

  test("review can also be rejected back to draft", () => {
    assert.equal(isValidTransition("review", "reject"), true);
    assert.equal(nextStatusFor("reject"), "draft");
  });

  test("approved can publish directly, skipping schedule", () => {
    assert.equal(isValidTransition("approved", "publish"), true);
  });

  test("unpublished can be republished or archived", () => {
    assert.equal(isValidTransition("unpublished", "publish"), true);
    assert.equal(isValidTransition("unpublished", "archive"), true);
  });

  test("archived can be republished", () => {
    assert.equal(isValidTransition("archived", "publish"), true);
  });
});

describe("content workflow - invalid transitions are rejected", () => {
  test("draft cannot publish directly", () => {
    assert.equal(isValidTransition("draft", "publish"), false);
  });

  test("draft cannot be archived directly", () => {
    assert.equal(isValidTransition("draft", "archive"), false);
  });

  test("published cannot be submitted for review again", () => {
    assert.equal(isValidTransition("published", "submit_review"), false);
  });

  test("review cannot publish directly (must be approved first)", () => {
    assert.equal(isValidTransition("review", "publish"), false);
  });

  test("scheduled cannot be approved again", () => {
    assert.equal(isValidTransition("scheduled", "approve"), false);
  });

  test("archived only allows publish, nothing else", () => {
    assert.equal(isValidTransition("archived", "submit_review"), false);
    assert.equal(isValidTransition("archived", "approve"), false);
    assert.equal(isValidTransition("archived", "archive"), false);
  });
});

describe("content workflow - permission requirements per action", () => {
  test("each workflow action maps to its required permission", () => {
    assert.equal(permissionRequiredFor("submit_review"), "submit_review");
    assert.equal(permissionRequiredFor("approve"), "approve");
    assert.equal(permissionRequiredFor("reject"), "approve");
    assert.equal(permissionRequiredFor("schedule"), "publish");
    assert.equal(permissionRequiredFor("publish"), "publish");
    assert.equal(permissionRequiredFor("unpublish"), "publish");
    assert.equal(permissionRequiredFor("archive"), "archive");
  });
});

describe("isWorkflowAction guard", () => {
  test("accepts known workflow action strings", () => {
    assert.equal(isWorkflowAction("publish"), true);
    assert.equal(isWorkflowAction("archive"), true);
  });

  test("rejects unknown strings and non-strings", () => {
    assert.equal(isWorkflowAction("delete_forever"), false);
    assert.equal(isWorkflowAction(123), false);
    assert.equal(isWorkflowAction(undefined), false);
    assert.equal(isWorkflowAction(null), false);
  });
});
