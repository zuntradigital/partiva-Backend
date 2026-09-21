import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PHONE_RE } from "../utils/phone.js";

describe("phone rule: exactly 10 digits, digits only", () => {
  test("10 digits are accepted", () => {
    assert.equal(PHONE_RE.test("0501234567"), true);
    assert.equal(PHONE_RE.test("1234567890"), true);
  });

  test("9 and 11 digits are rejected", () => {
    assert.equal(PHONE_RE.test("050123456"), false);
    assert.equal(PHONE_RE.test("05012345678"), false);
  });

  test("letters, symbols, spaces, signs and non-ASCII digits are rejected", () => {
    for (const bad of ["05012345ab", "050-123-4567", "050 123 4567", "+966501234", "0501234567 ", "٠٥٠١٢٣٤٥٦٧", "0501234567\n", ""]) {
      assert.equal(PHONE_RE.test(bad), false, JSON.stringify(bad));
    }
  });
});
