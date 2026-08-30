// Exercises hasPermission() against the real seeded role_permissions data
// (loaded once via reloadPermissionCache()) rather than mocking the cache --
// this is the same in-memory cache the running server uses, so these
// assertions reflect the actual current role grants.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasPermission, reloadPermissionCache } from "../middleware/permissions.js";
import pool from "../config/database.js";

before(async () => {
  await reloadPermissionCache();
});

after(async () => {
  await pool.end();
});

const NO_USER = -1;

describe("RBAC - authorized roles can access their permitted actions", () => {
  test("Author can create, edit, submit_review, and view articles", () => {
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "create"), true);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "edit"), true);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "submit_review"), true);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "view"), true);
  });

  test("Editor can approve, publish, archive, delete, create, edit, and view articles", () => {
    for (const action of ["approve", "publish", "archive", "delete", "create", "edit", "view"] as const) {
      assert.equal(hasPermission(NO_USER, ["Editor"], "articles", action), true, `Editor should have ${action}`);
    }
  });

  test("Super Admin bypasses all permission checks regardless of resource/action", () => {
    assert.equal(hasPermission(NO_USER, ["Super Admin"], "articles", "delete"), true);
    assert.equal(hasPermission(NO_USER, ["Super Admin"], "media", "delete"), true);
    assert.equal(hasPermission(NO_USER, ["Super Admin"], "audit_log", "view"), true);
  });
});

describe("RBAC - unauthorized roles are rejected", () => {
  test("Author cannot approve, publish, archive, or delete articles", () => {
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "approve"), false);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "publish"), false);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "archive"), false);
    assert.equal(hasPermission(NO_USER, ["Author"], "articles", "delete"), false);
  });

  test("Editor cannot submit_review articles (not granted to this role)", () => {
    assert.equal(hasPermission(NO_USER, ["Editor"], "articles", "submit_review"), false);
  });

  test("Sales has no article permissions at all", () => {
    for (const action of ["view", "create", "edit", "submit_review", "approve", "publish", "archive", "delete"] as const) {
      assert.equal(hasPermission(NO_USER, ["Sales"], "articles", action), false, `Sales should not have ${action}`);
    }
  });

  test("a role with no grants and no roles at all is rejected", () => {
    assert.equal(hasPermission(NO_USER, [], "articles", "view"), false);
    assert.equal(hasPermission(NO_USER, ["NonexistentRole"], "articles", "view"), false);
  });
});
