# Development & Production Setup

## Requirements

- Node.js 20 or newer
- npm 10+
- MySQL 8 (optional in local development; an automatic seeded in-memory store is used when `DATABASE_URL` is omitted)

## Run locally

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env` and optionally set `DATABASE_URL` for a MySQL 8 database.
3. If using MySQL, apply the schema with `npm run db:push`.
4. Start the app with `npm run dev` (binds to `http://0.0.0.0:3000`).

## Production build & deployment

1. Verify types and tests: `npm run check && npm test`
2. Build client and server bundles: `npm run build`
3. Start production server: `npm start`
4. Health and readiness probe is available at `GET /api/health`.

Local role sign-in is enabled for development and disabled automatically in production unless `LOCAL_AUTH_ENABLED=true` is explicitly configured. Institutional sign-in uses an OAuth 2.0 / OpenID Connect provider (`OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`, `OAUTH_USERINFO_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URL`). Document uploads use an S3-compatible bucket (`STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`, `STORAGE_ENDPOINT`) and automatically fall back to in-memory data URLs when S3 credentials are not yet configured.
