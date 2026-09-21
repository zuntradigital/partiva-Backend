import { env } from "../config/env.js";

// Server-side verification of a Google reCAPTCHA v2 token against Google's
// own siteverify API -- this is the actual security control. The frontend
// widget (Website's Recaptcha.tsx) only produces a token; a request is never
// treated as human-verified just because a token string is present in the
// body, only once Google itself confirms it here.
const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

interface SiteverifyResponse {
  success: boolean;
  hostname?: string;
  "error-codes"?: string[];
}

// Google's PUBLIC test secret: siteverify answers success=true for EVERY token,
// i.e. it verifies nothing. Fine on a developer machine; on a real deployment it
// would silently turn the robot check into a no-op, so there it is refused
// (fail closed) and reported loudly. "Real deployment" = NODE_ENV=production, or
// any configured browser origin that is not localhost.
const GOOGLE_TEST_SECRET = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";
const isLocalOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o);
const isRealDeployment = () => process.env.NODE_ENV === "production" || env.allowedOrigins.some((o) => !isLocalOrigin(o));

let warnedAboutTestSecret = false;

export async function verifyRecaptcha(token: unknown, remoteIp?: string): Promise<boolean> {
  if (typeof token !== "string" || token.trim().length === 0) return false;

  if (env.recaptchaSecretKey === GOOGLE_TEST_SECRET && isRealDeployment()) {
    if (!warnedAboutTestSecret) {
      warnedAboutTestSecret = true;
      console.error("[recaptcha] RECAPTCHA_SECRET_KEY is Google's public TEST secret on a real deployment -- it accepts any token, so verification is refused. Set the real secret that pairs with the production site key.");
    }
    return false;
  }

  try {
    const params = new URLSearchParams({ secret: env.recaptchaSecretKey, response: token });
    if (remoteIp) params.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: params });
    if (!res.ok) return false;

    const data = (await res.json()) as SiteverifyResponse;
    if (data.success !== true) {
      // Google's own reason (e.g. invalid-input-secret = wrong/mismatched secret,
      // invalid-input-response = bad/expired/reused token or a site key from a
      // different key pair). Codes only -- never the token or the secret.
      console.warn(`[recaptcha] siteverify rejected the token: ${(data["error-codes"] ?? ["no-error-code"]).join(", ")}`);
    }
    return data.success === true;
  } catch {
    // A network/Google-outage failure must not silently let unverified
    // submissions through -- fail closed, same as an invalid token.
    return false;
  }
}
