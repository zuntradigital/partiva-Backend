import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readContactMessageBody } from "../modules/contact-messages/contact-messages.routes.js";
import { readCompanyRequestBody } from "../modules/company-requests/company-requests.routes.js";
import { ApiError } from "../utils/apiError.js";

const contact = (phone: unknown) => ({ fullName: "Sam", email: "sam@example.com", phone, inquiryType: "sales", message: "A long enough message." });
const company = (contactPhone: unknown) => ({
  tradeName: "Acme Parts", crNumber: "1234567890", businessActivity: "retail", contactName: "Sam", city: "Riyadh", contactEmail: "sam@example.com", contactPhone, consent: true,
});
const rejects = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ApiError && e.statusCode === 422);

describe("Contact form (server-side): phone is optional, otherwise exactly 10 digits", () => {
  test("10 digits accepted", () => assert.equal(readContactMessageBody(contact("0501234567")).phone, "0501234567"));
  test("empty / missing accepted (optional field)", () => {
    assert.equal(readContactMessageBody(contact("")).phone, null);
    assert.equal(readContactMessageBody(contact(undefined)).phone, null);
  });
  test("9 digits, 11 digits, letters and symbols rejected", () => {
    for (const bad of ["050123456", "05012345678", "05012345ab", "050-123-4567", "+966501234", "0501234567890123456789"]) rejects(() => readContactMessageBody(contact(bad)));
  });
  test("a non-string phone is rejected", () => rejects(() => readContactMessageBody(contact(501234567))));
});

describe("Register form (server-side): phone is required and exactly 10 digits", () => {
  test("10 digits accepted", () => assert.equal(readCompanyRequestBody(company("0501234567")).contactPhone, "0501234567"));
  test("empty / missing rejected (required field)", () => {
    rejects(() => readCompanyRequestBody(company("")));
    rejects(() => readCompanyRequestBody(company(undefined)));
  });
  test("9 digits, 11 digits, letters and symbols rejected", () => {
    for (const bad of ["050123456", "05012345678", "05012345ab", "050 123 4567", "+966501234"]) rejects(() => readCompanyRequestBody(company(bad)));
  });
});
