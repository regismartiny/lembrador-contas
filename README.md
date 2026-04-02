# Lembrador de Contas

A personal bill-tracking web application. Keeps track of recurring bills, fetches values from email, table, or external API sources, and sends push notifications for upcoming payments.

## Features

- Dashboard with per-user bill list, grouped by payment type (PIX, Dinheiro)
- Three value sources per bill: **Table** (manual entry), **Email** (parsed from Gmail), **API** (HTTP fetch + JSON path)
- Web Push notifications (PWA-ready, requires VAPID keys)
- Simple passphrase authentication gate
- Bill processing: computes active bills for previous / current / next month

## Tech stack

- **Runtime:** Bun
- **Framework:** Express 4 + EJS templates
- **Database:** MongoDB (Mongoose ODM)
- **Frontend:** Bootstrap 4, jQuery

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
| `APP_PASSWORD` | No | Passphrase to protect all routes. If unset, auth is disabled (dev mode) |
| `SESSION_SECRET` | Yes | Random secret for session encryption. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `VAPID_PUBLIC_KEY` | No | Web Push public key (push notifications disabled if missing) |
| `VAPID_PRIVATE_KEY` | No | Web Push private key |
| `VAPID_MAILTO` | No | Contact email for VAPID |
| `LOG_LEVEL` | No | Pino log level: `debug`, `info`, `warn`, `error` (default `info`) |

### Generating VAPID keys

```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

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
| `GET` | `/dashboard/processBills` | Trigger bill processing for current periods |
| `GET` | `/dashboard/paybill/:id` | Mark an active bill as paid |
| `GET` | `/dashboard/deleteProcessed` | Delete all processed active bills |
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
| `GET` | `/health` | Health check (returns `{"status":"ok"}`) |
| `GET/POST` | `/login`, `/logout` | Authentication |

---

## Development tips

- **Watch mode:** `bun run dev` restarts the server on any file change.
- **Skip auth locally:** leave `APP_PASSWORD` unset in `.env`.
- **MongoDB without credentials:** leave `MONGODB_USER` / `MONGODB_PASSWORD` unset for a local unauthenticated instance.
- **Log verbosity:** set `LOG_LEVEL=debug` to see all internal log messages.
