# Lembrador-Contas — Improvement Plan

Progress tracked here. Items are ordered by priority. Check boxes are ticked as each item is completed.

---

## Priority 1 — Critical Bugs (runtime crashes)

- [x] **base64Util.js** — `binary.charCodeAt(i)` uses undefined variable; should be `text.charCodeAt(i)`
- [x] **users.js:74** — `return er` typo causes ReferenceError on failed user deletion; should be `return err`
- [x] **emailUtils.js** — `PDFParser` used but never imported; add `import PDFParser from 'pdf2json'`
- [x] **notifications.js** — VAPID keys are empty string `''`; push notifications completely broken. Load from env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO`). Hardcoded personal email moved to env.

---

## Priority 2 — Performance Bugs

- [x] **billProcessing.js `runParallel()`** — awaits in a loop (sequential). Replace with `Promise.all()`.

---

## Priority 3 — Security

- [x] **No authentication** — added `express-session` + `APP_PASSWORD` passphrase gate. Login page at `/login`, logout at `/logout`. Disabled automatically if `APP_PASSWORD` is unset (dev mode).
- [x] **No CSRF protection** — session cookie set with `sameSite: 'strict'` and `httpOnly: true`, which blocks cross-origin form submissions without a dedicated library.
- [x] **MongoDB has no credentials** — `docker-compose.amd64.yml` now passes `MONGODB_USER`/`MONGODB_PASSWORD` from the host `.env` file to both the MongoDB container (`MONGO_INITDB_ROOT_*`) and the app container.
- [x] **No input validation** — added server-side validation to `POST /users/add`, `POST /users/update`, `POST /bills/add`, `POST /bills/update` (required fields, email format, dueDay 1–31, valueSourceType enum).
- [ ] **No HTTPS** — set up TLS or put a reverse proxy (nginx/Caddy) in front. Out of scope for application code.

---

## Priority 4 — Incomplete Features

- [ ] **API data source not implemented** — `apicollection` schema and UI exist but `billProcessing.js` never handles `valueSourceType === 'API'`. Implement `findApiDataBills()` similar to `findEmailBills()`.
- [ ] **Push notifications need a UI trigger** — currently only invocable via raw POST to `/notifications/push/send`. Add a button to the dashboard.

---

## Priority 5 — Code Quality

- [ ] **Standardize async style** — mix of callbacks, `.then()`, and `async/await` across routes. Standardize on `async/await` everywhere.
- [ ] **Extract business logic from routes** — dashboard.js and user-bill-list contain data transformation logic that belongs in a service/util layer.
- [ ] **Centralize error handling** — same `handleError()` + redirect pattern copy-pasted in every route. Add an Express error middleware and use `next(err)`.
- [ ] **Structured logging** — replace all `console.log` / `console.error` with `pino` or `winston` with log levels.
- [ ] **Split db.js** — 11 Mongoose schemas in one file. Move each to `src/models/<name>.js`.
- [ ] **Remove yarn.lock** — project uses Bun exclusively; `yarn.lock` is stale and confusing.

---

## Priority 6 — DevOps / Operations

- [x] **Add .env.example** — document all required environment variables so setup is reproducible.
- [ ] **Docker: install deps at build time** — `docker-compose` currently runs `bun install` on every container start. Move to a `Dockerfile` with a proper build step.
- [x] **Pin MongoDB image version** — pinned to `mongo:7`.
- [x] **Add Docker health checks** — added `healthcheck` to both services in `docker-compose.amd64.yml`; app service now waits for MongoDB to be healthy before starting.
- [x] **Add a `/health` endpoint** — `GET /health` returns `{ status: 'ok' }`, used by Docker health check.

---

## Priority 7 — Tests

- [ ] **Unit tests for parsers** — `cpflEmailParser.js` and `corsanEmailParser.js` are fragile regex/DOM scrapers. Add snapshot tests with real email fixtures.
- [ ] **Unit tests for billProcessing.js** — test period logic, date calculation, value splitting, and `processBills()` orchestration.
- [ ] **Integration tests for key routes** — at minimum: `POST /bills/add`, `GET /dashboard/processBills`, `GET /dashboard/paybill/:id`.

---

## Priority 8 — Documentation

- [ ] **README.md** — add setup instructions, environment variables reference, how to run locally and with Docker.
- [ ] **OpenAPI / Swagger spec** — document all API endpoints for future maintainers.
