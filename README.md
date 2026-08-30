# Partiva Admin Backend

REST API powering the Partiva Dashboard (admin CMS) and the Partiva public Website. Handles authentication, RBAC, content management (articles, pages/sections, pricing, FAQ, testimonials, contact info, media), and audit logging.

## Features

- JWT-based authentication with role- and permission-based access control (RBAC), including custom roles and per-user permission grants
- Content modules: articles/blog, pages & sections, pricing plans (with a draft → review → approve workflow), FAQ, testimonials, contact info, media library
- Immutable audit log of admin actions
- Admin invitation flow (email-based, token-hashed, expiring)
- Public read-only endpoints consumed directly by the Website
- Rate limiting, security headers (Helmet), CORS allowlist

## Tech Stack

- Node.js, Express 5, TypeScript
- MySQL (via `mysql2`)
- `jsonwebtoken`, `bcrypt` for auth
- `nodemailer` for transactional email (invitations)

## Project Structure

```
src/
  app.ts            # Express app, middleware, route mounting
  server.ts         # Entry point
  config/           # env loading, DB pool
  db/
    migrate.ts       # migration runner
    migrations/       # numbered SQL migrations
  middleware/        # auth, permissions, audit log, error handling
  modules/            # one folder per domain (auth, articles, pages, pricing, faq,
                       # testimonials/reviews, contact, media, users, roles, invitations,
                       # categories, tags, audit) — each with routes/controller/service/repository
  scripts/            # one-off maintenance scripts (email test, article import)
  types/              # shared TypeScript types
  utils/              # jwt, password hashing, token generation, validation helpers
```

## Requirements

- Node.js 20+
- MySQL 8+

## Installation

```bash
npm install
cp .env.example .env   # fill in real values
npm run migrate
npm run dev
```

## Environment Variables

See `.env.example` for the full list (never commit real values). Key variables:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `JWT_SECRET` | Secret used to sign/verify session tokens — must be a long random value in production |
| `JWT_EXPIRES_IN` | Session token lifetime |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost |
| `INVITATION_TOKEN_EXPIRY_HOURS` | Admin invitation link lifetime |
| `ADMIN_APP_URL` | Dashboard URL, used to build invitation links |
| `ALLOWED_ORIGINS` | Comma-separated list of origins allowed to call this API with credentials |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Outbound email (invitations) |

## Development

```bash
npm run dev        # tsx watch — auto-restarts on change
npm run migrate     # apply pending SQL migrations
```

## Build / Production

```bash
npm run build       # tsc -> dist/
npm start           # node dist/server.js
```

## Architecture Notes

- **Permissions** are cached in memory (`middleware/permissions.ts`) and reloaded after any role/permission write, so authorization checks stay synchronous and fast.
- **Session freshness**: `requireAuth` re-checks the requesting user's account status and current roles against the database on every request (not just the JWT's signed claims), so a disabled/deleted account or a role change takes effect immediately rather than waiting for the token to expire.
- **Media** is stored as validated base64 data URLs directly in MySQL (not on disk), with an allow-listed set of image MIME types (SVG intentionally excluded — script-injection risk).
- **Migrations** are plain numbered SQL files under `src/db/migrations/`, applied in order by `npm run migrate`. Never edit an already-applied migration; add a new one instead.
- Public (`/api/...`) and admin (`/api/admin/...`) routes are separated per module; admin routes require `requireAuth` and, per-endpoint, `requirePermission`/`requireSuperAdmin`.

## Deployment Notes

- Requires a reachable MySQL instance and the environment variables above set on the host.
- Run `npm run build && npm start` (or run migrations then start) behind a process manager (e.g. PM2/systemd) and a reverse proxy that terminates TLS.
- If deployed behind a reverse proxy/load balancer, configure Express's `trust proxy` setting appropriately so rate limiting keys on the real client IP.
