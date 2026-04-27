# Lembrador de Contas

A personal bill-tracking web application. Keeps track of recurring bills, fetches values from email, table, or external API sources, and sends push notifications for upcoming payments.

## Features

- Dashboard with per-user bill list, grouped by payment type (PIX, Dinheiro)
- Three value sources per bill: **Table** (manual entry), **Email** (parsed from Gmail), **API** (HTTP fetch + JSON path)
- Web Push notifications (PWA-ready, requires VAPID keys)
- Multi-layer authentication: Cloudflare Access JWT auto-login, email + shared password login, admin role for write operations
- Bill processing: computes active bills for previous / current / next month

## Tech stack

- **Runtime:** Bun
- **Framework:** Express 4 + EJS templates
- **Database:** MongoDB (Mongoose ODM)
- **Frontend:** Bootstrap 4, jQuery
- **Security:** helmet, csrf-csrf, express-rate-limit, jose (Cloudflare Access JWT)
- **Logging:** Pino
- **Testing:** Bun test runner

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1.0
- MongoDB instance (local or remote)

---

## Local setup (without Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd lembrador-contas/volumes/lembrador-contas

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in your values (see Environment variables below)

# 4. Start the server
bun run start          # production
bun run dev            # watch mode (auto-restart on file change)
```

The app listens on `http://localhost:9090` by default.

---

## Docker setup

```bash
# 1. Copy and fill in the environment file at the repo root
cp volumes/lembrador-contas/.env.example .env
# Edit .env

# 2. Build and start both services (app + MongoDB)
docker compose -f docker-compose.amd64.yml up --build -d

# 3. View logs
docker compose -f docker-compose.amd64.yml logs -f lembrador-contas
```

The first `--build` compiles the image and runs `bun install` inside it.
Subsequent starts skip the install step (deps are cached in a named Docker volume).

To stop: `docker compose -f docker-compose.amd64.yml down`

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values below.

| Variable | Required | Description |
|---|---|---|
| `MONGODB_IP` | Yes | MongoDB host / IP |
| `MONGODB_PORT` | No | MongoDB port (default `27017`) |
| `MONGODB_USER` | Yes | MongoDB username |
| `MONGODB_PASSWORD` | Yes | MongoDB password |
| `MONGODB_DATABASE` | No | Database name (default `lembrador-contas`) |
| `PORT` | No | App HTTP port (default `9090`) |
| `APP_PASSWORD` | No | Shared password for email-based login. If unset, auth is disabled (dev mode) |
| `SESSION_SECRET` | Yes | Random secret for session encryption. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `VAPID_PUBLIC_KEY` | No | Web Push public key (push notifications disabled if missing) |
| `VAPID_PRIVATE_KEY` | No | Web Push private key |
| `VAPID_MAILTO` | No | Contact email for VAPID |
| `LOG_LEVEL` | No | Pino log level: `debug`, `info`, `warn`, `error` (default `info`) |
| `CF_ACCESS_TEAM_DOMAIN` | No | Cloudflare Access team domain. Enables auto-login via Cloudflare JWT when set with `CF_ACCESS_AUD` |
| `CF_ACCESS_AUD` | No | Cloudflare Access application audience tag |

### Generating VAPID keys

```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

---

## Security

- **Helmet** — sets security-related HTTP headers (CSP disabled because the app uses inline scripts and CDN resources)
- **CSRF** — double-submit cookie pattern via csrf-csrf; tokens are exposed to EJS views as `csrfToken` and validated on all POST requests (`_csrf` body field or `x-csrf-token` header)
- **Rate limiting** — 1000 requests per 15 minutes per IP on all routes; login route has a stricter 10-attempt / 15-minute limiter
- **Input validation** — `validateBody` middleware checks required fields, patterns, enums, and ranges; `validateObjectId` rejects malformed MongoDB ObjectIds
- **Cloudflare Access** — optional auto-login via JWT verification when `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set. Explicit login (email + password) overrides Cloudflare auth
- **Admin role** — User model has an `admin` boolean flag. The `requireAdmin` middleware protects write operations (bill processing, payments, and data deletion). Non-admin users can view but not modify data

---

## Bill value sources

Each bill has a **Value Source Type** that determines how the amount is fetched during processing:

| Type | Description |
|---|---|
| **TABLE** | Value entered manually per period (month/year) in the Tables section |
| **EMAIL** | Value parsed from a Gmail inbox using a configured parser |
| **API** | Value fetched from an HTTP endpoint; extracted via a dot-notation JSON path (e.g. `data.amount`) |

---

## Routes overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Redirect to dashboard |
| `GET` | `/dashboard` | Main dashboard |
| `GET` | `/dashboard/user-bill-list` | Filtered bill list by user and period |
| `POST` | `/dashboard/processBills` | Trigger bill processing (admin only) |
| `POST` | `/dashboard/paybill/:id` | Mark an active bill as paid (admin only) |
| `POST` | `/dashboard/deleteProcessed` | Delete all processed active bills (admin only) |
| `GET` | `/users/list` | User list |
| `GET/POST` | `/users/new`, `/users/add` | Create user |
| `GET/POST` | `/users/edit/:id`, `/users/update` | Edit user |
| `GET` | `/bills/list` | Bill list |
| `GET/POST` | `/bills/new`, `/bills/add` | Create bill |
| `GET/POST` | `/bills/edit/:id`, `/bills/update` | Edit bill |
| `GET` | `/tables/list` | Table list |
| `GET` | `/emails/list` | Email source list |
| `GET` | `/apis/list` | API source list |
| `GET` | `/notifications/push/public_key` | Get VAPID public key |
| `POST` | `/notifications/push/register` | Register push subscription |
| `POST` | `/notifications/push/send` | Send push notification to all subscribers |
| `GET/POST` | `/html-parser` | HTML parsing utility |
| `GET` | `/health` | Health check (returns `{"status":"ok"}`) |
| `GET/POST` | `/login`, `/logout` | Authentication |

---

## Project structure

```
src/
  app.js                 # Express app setup, middleware pipeline
  bin/www                # Entry point
  db.js                  # Mongoose connection + model registry
  enums.js               # Shared enums (status, payment type, etc.)
  middleware/
    auth.js              # requireAuth, requireAdmin
    cfAccess.js          # Cloudflare Access JWT verification
    csrf.js              # CSRF token generation and validation
    validate.js          # Request body validation
    validateObjectId.js  # MongoDB ObjectId param validation
  models/                # Mongoose schemas (Bill, ActiveBill, User, Table, Email, API, etc.)
  routes/                # Express route modules
  util/
    asyncHandler.js      # Async error wrapper for route handlers
    billProcessing.js    # Bill processing logic (periods, grouping, totals)
    logger.js            # Pino logger instance
    base64Util.js        # Base64 encoding/decoding helpers
    emailUtils.js        # Email-related utilities
    gmail.js             # Gmail API integration
  parser/
    cpflEmailParser.js   # CPFL electricity bill email parser
    corsanEmailParser.js # CORSAN water bill email parser
  views/                 # EJS templates
  public/                # Static assets (CSS, JS, service worker)
  __tests__/             # Test files (Bun test runner)
```

---

## Development tips

- **Watch mode:** `bun run dev` restarts the server on any file change.
- **Skip auth locally:** leave `APP_PASSWORD` unset in `.env`.
- **MongoDB without credentials:** leave `MONGODB_USER` / `MONGODB_PASSWORD` unset for a local unauthenticated instance.
- **Log verbosity:** set `LOG_LEVEL=debug` to see all internal log messages.
- **API spec:** an OpenAPI 3.0 spec is available at `volumes/lembrador-contas/openapi.yaml`.

---

## Testing

Tests use Bun's built-in test runner. 19 test files cover middleware, utilities, parsers, and route handlers.

```bash
bun run test              # run all tests
bun run test:coverage     # run with coverage report
bun run test:watch        # watch mode (re-run on file change)
```

Tests require `SESSION_SECRET` (set automatically by the scripts above). No MongoDB connection is needed — route tests use an in-memory mock setup.

CI runs automatically via GitHub Actions on every push and pull request (`.github/workflows/test.yml`).
