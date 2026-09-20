import { env } from "../config/env.js";

// Server-side verification of a Google reCAPTCHA v2 token against Google's
// own siteverify API -- this is the actual security control. The frontend
// widget (Website's Recaptcha.tsx) only produces a token; a request is never
// treated as human-verified just because a token string is present in the
// body, only once Google itself confirms it here.
const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyRecaptcha(token: unknown, remoteIp?: string): Promise<boolean> {
  if (typeof token !== "string" || token.trim().length === 0) return false;

  try {
    const params = new URLSearchParams({ secret: env.recaptchaSecretKey, response: token });
    if (remoteIp) params.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: params });
    if (!res.ok) return false;

    const data = (await res.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    // A network/Google-outage failure must not silently let unverified
    // submissions through -- fail closed, same as an invalid token.
    return false;
  }
}
