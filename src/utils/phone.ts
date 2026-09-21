// The one phone-number rule for every public form: exactly 10 digits, digits
// only, no country code / spaces / symbols. Used by the Contact form
// (contact-messages.routes.ts) and the Register-your-company form
// (company-requests.routes.ts); the website mirrors it in
// src/app/lib/formValidation.ts (PHONE_PATTERN). Change it here and there only.
export const PHONE_DIGITS = 10;
export const PHONE_RE = new RegExp(`^\\d{${PHONE_DIGITS}}$`);
