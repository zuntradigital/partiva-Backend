import { describe, test, before, afterEach } from "node:test";
import assert from "node:assert/strict";

// env.ts refuses to load without these; they are dummies for this unit test only.
for (const [k, v] of Object.entries({ JWT_SECRET: "x", SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_FROM: "f", ADMIN_APP_URL: "http://localhost:3001", RECAPTCHA_SECRET_KEY: "x" })) {
  process.env[k] ??= v;
}

const TEST_SECRET = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";
let env: typeof import("../config/env.js").env;
let verifyRecaptcha: typeof import("../utils/verifyRecaptcha.js").verifyRecaptcha;

const realFetch = globalThis.fetch;
let googleCalls = 0;
const stubGoogle = (body: unknown) => {
  googleCalls = 0;
  globalThis.fetch = (async () => {
    googleCalls++;
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetch;
};

before(async () => {
  ({ env } = await import("../config/env.js"));
  ({ verifyRecaptcha } = await import("../utils/verifyRecaptcha.js"));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NODE_ENV;
});

describe("verifyRecaptcha", () => {
  test("no token -> false without calling Google", async () => {
    stubGoogle({ success: true });
    assert.equal(await verifyRecaptcha(undefined), false);
    assert.equal(await verifyRecaptcha("   "), false);
    assert.equal(googleCalls, 0);
  });

  test("a real secret is verified by Google: success -> true, rejection -> false", async () => {
    env.recaptchaSecretKey = "real-secret";
    env.allowedOrigins = ["https://partiva.tech"];
    stubGoogle({ success: true });
    assert.equal(await verifyRecaptcha("tok"), true);
    stubGoogle({ success: false, "error-codes": ["invalid-input-response"] });
    assert.equal(await verifyRecaptcha("tok"), false);
    assert.equal(googleCalls, 1);
  });

  test("Google's public TEST secret is REFUSED on a real deployment (would accept any token) and Google is not even asked", async () => {
    env.recaptchaSecretKey = TEST_SECRET;
    env.allowedOrigins = ["https://partiva.tech", "https://cms.partiva.tech"];
    stubGoogle({ success: true }); // what Google's test secret answers for any token
    assert.equal(await verifyRecaptcha("anything"), false);
    assert.equal(googleCalls, 0);
    env.allowedOrigins = ["http://localhost:3001"];
    process.env.NODE_ENV = "production";
    assert.equal(await verifyRecaptcha("anything"), false, "NODE_ENV=production alone is enough to refuse it");
  });

  test("the TEST secret still works for local development (localhost origins, not production)", async () => {
    env.recaptchaSecretKey = TEST_SECRET;
    env.allowedOrigins = ["http://localhost:3001", "http://localhost:3002", "http://127.0.0.1:3002"];
    stubGoogle({ success: true });
    assert.equal(await verifyRecaptcha("tok"), true);
    assert.equal(googleCalls, 1);
  });

  test("a Google/network failure fails closed", async () => {
    env.recaptchaSecretKey = "real-secret";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    assert.equal(await verifyRecaptcha("tok"), false);
  });
});
