# Development setup

## Requirements

- Node.js 20 or newer
- pnpm 10
- MySQL 8 (required for authenticated MIS workflows)

## Run locally

1. Install packages with `pnpm install`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` for a local MySQL database.
3. Apply the schema with `pnpm db:push`.
4. Start the app with `pnpm dev` and open the local URL printed in the terminal.

Local role sign-in is enabled for development and disabled automatically in production. Institutional sign-in requires an OAuth 2.0/OpenID Connect provider; set its authorization, token, and user-info endpoints and registered callback URL in `.env`. Document uploads require an S3-compatible bucket and credentials.

The dev and production scripts set `NODE_ENV` in a cross-platform way, including Windows.
