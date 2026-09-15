# api.iworkhere.com

[![CI](https://github.com/williamoak/api.iworkhere.com/actions/workflows/ci.yml/badge.svg)](https://github.com/williamoak/api.iworkhere.com/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A production-oriented TypeScript and Express API for the iworkhere applications. The service combines application-scoped authentication, tenant-aware persistence, generated route registration, localization, operational health endpoints, and a strongly tested domain layer around a PostgreSQL-compatible database.

> **Repository status**: `npm test` currently passes **765 tests across 86 test files**. The latest coverage run reports **97.86% overall coverage**, exceeding the configured global thresholds.

## Why this codebase stands out

- **Security-conscious auth domain**: opaque access and refresh tokens are generated with cryptographic randomness and persisted as SHA-256 hashes; access validation rejects expired, revoked, and incorrectly typed tokens.
- **Refresh-token rotation**: refresh operations revoke the predecessor and issue a replacement pair transactionally, with cache invalidation for the old token.
- **Application-scoped identity**: authentication resolves an enabled application before user and credential work proceeds, keeping users, tokens, and origins associated with the calling application.
- **Complete account lifecycle**: local registration and login, Google OAuth 2.0, email verification, password reset, password history enforcement, account upgrade, token revocation, and token cleanup are represented as separate domain services and route modules.
- **Tenant isolation at the request boundary**: tenant resolution precedes authentication and database access; tenant transactions acquire a dedicated pooled connection, set `search_path`, bind a scoped Drizzle client through `AsyncLocalStorage`, and restore the connection before release.
- **Composable request pipeline**: route modules declare validation schemas and whether authentication is required. The loader applies validation, auth-specific rate limits, bearer auth, concurrency throttling, caching, response shaping, and method-not-allowed handling in a deterministic order.
- **Runtime-discovered API surface**: `src/loaders/routeLoader.ts` recursively discovers `GET.ts`, `POST.ts`, `PUT.ts`, `PATCH.ts`, and `DELETE.ts` modules, builds a route metadata tree, and binds the handlers without a monolithic router file.
- **Operationally useful diagnostics**: request IDs, structured debug phases, request logging, health checks, memory/database/network monitors, and a cleanup job make failures observable without coupling domain services to HTTP responses.
- **Data-backed localization**: supported languages and slugs are discovered from the database, cached in memory, invalidated on mutation, and resolved with ISO-639, region, dialect, and family fallbacks.
- **Contract and test discipline**: Zod validation, DTO overlays, OpenAPI/Swagger generation, strict TypeScript settings, isolated Vitest mocks, CI typechecking, and critical-vulnerability auditing reinforce the API contract.

### Executive documents

- <a href="https://api.iworkhere.com/readme/William.Oak.Executive.Resume.Sept.2026.pdf" target="_blank" rel="noopener noreferrer">William Oak Executive Resume (September 2026)</a>
- <a href="https://api.iworkhere.com/readme/William.Oak.Executive.Cover.Letter.Sept.2026.pdf" target="_blank" rel="noopener noreferrer">William Oak Executive Cover Letter (September 2026)</a>
- <a href="https://api.iworkhere.com/docs" target="_blank" rel="noopener noreferrer">Open the Swagger UI documentation</a>. Regenerate the contract with `npm run swagger:gen`.

## Architecture at a glance

```text
Client
  │
  ▼
nginx / TLS termination
  │  internal HTTP
  ▼
Express app factory
  │
  ├─ CORS, body parsing, cookies
  ├─ tenant resolution
  ├─ request/audit logging
  ├─ tenant-scoped DB context
  ├─ web authentication context
  └─ locale detection
       │
       ▼
Dynamic route loader (`/v1/**`)
  │
  ├─ Zod request validation
  ├─ auth-route rate limits
  ├─ optional bearer authentication
  ├─ concurrency throttling
  ├─ cache policy
  └─ handler + DTO response shaping
       │
       ├─ Auth services
       ├─ Localization services/cache
       ├─ Configuration services
       ├─ Monitoring/health services
       └─ Warframe data services
              │
              ├─ Drizzle ORM
              ├─ CockroachDB / PostgreSQL-compatible storage
              └─ Redis cache
```

The production server listens on HTTP port `4300`; public HTTPS is expected to be terminated by nginx. Swagger UI is loaded only when `NODE_ENV` is not `production`.

## Technology

- **Runtime**: Node.js, TypeScript, native ES modules
- **HTTP**: Express 5, dynamic route loading, CORS, cookies
- **Persistence**: CockroachDB using the PostgreSQL wire protocol, `pg`, Drizzle ORM, SQL migrations
- **Caching**: Redis via `ioredis`, plus an in-memory localization cache
- **Validation**: Zod request schemas and DTO response mapping
- **Authentication**: bcryptjs local passwords, opaque bearer tokens, Google OAuth 2.0, HMAC-signed OAuth state
- **Email**: Nodemailer and Brevo integration with email audit records
- **Testing**: Vitest, V8 coverage, isolated database/filesystem mocks
- **Quality tooling**: TypeScript strict mode, ESLint, Prettier, Swagger generation, GitHub Actions

## API surface

All versioned routes currently live under `/v1`.

### Authentication and identity

| Area | Endpoints |
| --- | --- |
| Registration and login | `PUT /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/auth/me`, `PUT /v1/auth/upgrade` |
| Token lifecycle | `PUT /v1/auth/refresh`, `DELETE /v1/auth/token` |
| Google OAuth | `GET /v1/auth/oauth/google`, `GET /v1/auth/oauth/google/callback` |
| Email ownership | `PUT /v1/auth/emailverify`, `GET /v1/auth/emailverify`, `PUT /v1/auth/emailverify/resend` |
| Password recovery | `PUT /v1/auth/passreset/initiate`, `PUT /v1/auth/passreset/verify`, `PUT /v1/auth/passreset/complete` |
| EULA/localized content | `GET /v1/auth/eula` |

### Platform and product data

- **Configuration**: `GET`, `PUT`, and `DELETE /v1/config`
- **Localization**: `GET`, `PUT`, and `DELETE /v1/localization`
- **Health**: `/v1/health`, `/v1/health/api`, `/v1/health/database`, `/v1/health/memory`
- **Monitoring**: `/v1/monitor`, `/v1/monitor/lang`, `/v1/monitor/localization`, `/v1/monitor/network`, `/v1/monitor/visit`
- **Warframe data**: CRUD-style endpoints for `/v1/warframe/modules`, `/v1/warframe/warframes`, and `/v1/warframe/weapons`
- **Generated documentation**: `GET /v1/readme`; development Swagger UI is available at `/docs`

## Authentication design

### Local credentials

1. The request resolves an enabled `application` from `app_key` or the request host.
2. Registration/login validates input and resolves the application/user context.
3. Passwords are hashed with bcrypt using 12 rounds; password history prevents reuse.
4. Successful login issues application-scoped access and refresh tokens.
5. Only token hashes are persisted in `auth_tokens`; raw bearer values are returned to the caller and are not used as database identifiers.

### Bearer access tokens

Clients send `Authorization: Bearer <token>`. The middleware hashes the presented token, checks the token type, expiration, and revocation state, then attaches `req.auth.userId`. Valid lookups are cached in Redis until token expiry; revocation deletes the corresponding cache entry.

### Refresh rotation

A valid refresh token is single-use from the lifecycle perspective: it is revoked inside a database transaction, a new refresh token and access token are inserted, and the replacement relationship is recorded. Reuse of an expired or revoked token fails with an authentication error.

### Google OAuth

The OAuth flow carries the application key, nonce, redirect target, and flow type inside an HMAC-SHA256-signed `state` value. The callback verifies the signature before exchanging the authorization code, resolving the user/application association, and redirecting success or failure.

### Email verification and password reset

Verification and reset tokens are random, time-limited, and stored as SHA-256 hashes. Resend and reset initiation paths are intentionally non-enumerating where applicable. Completing a password reset updates the local credential, records password history, revokes existing auth tokens, and deletes the reset token.

## Request and tenancy model

The global middleware order is intentional:

1. Resolve the tenant from `X-Tenant`, origin/referer, hostname, or `app_key`.
2. Record request/audit information.
3. Acquire a tenant-scoped database connection and bind it to the request context.
4. Establish optional web authentication.
5. Detect and resolve the requested locale.

Route-level processing then adds validation, auth rate limits, required bearer authentication, concurrency throttling, cache enforcement, and response shaping. This separation keeps cross-cutting controls consistent while allowing each endpoint to remain a small, testable module.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm
- CockroachDB or another compatible PostgreSQL endpoint
- Redis
- TLS client certificates for CockroachDB deployments
- Google OAuth credentials and an email provider when those flows are enabled

### Install

```bash
git clone <repo-url>
cd api.iworkhere.com
npm ci
cp .env.example .env.development
```

Populate the environment file with database, Redis, token TTL, CORS, email, and OAuth values. Do not commit secrets. The configuration loader supports this precedence (later values win): `.env`, `.env.local`, `.env.<NODE_ENV>`, `.env.<NODE_ENV>.local`, then process environment variables.

For database tooling, `drizzle.config.ts` expects `DB_HOSTNAME`, `DB_PORT` (default `26257`), `DB_NAME`, `DB_USER`, and `DB_CERT_DIR`; the certificate directory must contain `ca.crt`, `client.<DB_USER>.crt`, and `client.<DB_USER>.key`.

### Database setup

```bash
npm run drizzle:check
npm run drizzle:generate
npm run drizzle:apply
npm run seed:data
```

The checked-in migrations are under [`src/db/migrations`](./src/db/migrations), and schema definitions are under [`src/db/schema`](./src/db/schema).

### Run locally

```bash
npm run dev
```

The API starts at `http://<HOST_IP>:4300`. In non-production environments, open `http://<HOST_IP>:4300/docs` for Swagger UI.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the TypeScript server with `tsx` |
| `npm run build` | Strictly typecheck and emit `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Run the full Vitest suite |
| `npm run test:coverage` | Run tests with V8 HTML/text coverage |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Lint TypeScript sources |
| `npm run format` | Format TypeScript sources |
| `npm run swagger:gen` | Regenerate `swagger.json` |
| `npm run setup:hooks` | Enable tracked Git hooks |
| `npm run userclean` | Run the user cleanup utility |

## Quality gates

The CI workflow runs on pull requests and pushes to `main`, `master`, and `testing` branches. It installs with `npm ci`, runs `npm run build`, and executes `npm audit --audit-level=critical`.

The Vitest configuration enforces these global minimums for coverage runs:

- Statements: `80%`
- Branches: `75%`
- Functions: `80%`
- Lines: `80%`

The repository’s latest local verification:

```text
86 test files passed
765 tests passed
97.86% overall coverage
npm run build passed
```

Tests are organized by middleware, loaders, services, routes, validation, DTOs, database mappers/schema, jobs, cache, and application bootstrap. Shared environment and safety mocks live in `tests/vitest.setup.ts`; domain implementations are mocked locally when route tests need isolation.

## Project layout

```text
src/
├── admin/                 Admin application and welcome UI
├── cache/                 Redis adapter and localization cache
├── db/                    Drizzle schema, migrations, seeds, mappers
├── dto/                   Response/data-transfer mapping
├── helpers/               Configuration, logging, mail, Swagger helpers
├── jobs/                  Background cleanup jobs
├── loaders/               Dynamic route and Swagger loaders
├── middleware/            Tenant, auth, validation, cache, limits, logging
├── routes/v1/             File-based API endpoints
├── services/              Auth, database, localization, and user services
└── validation/            Zod request schemas

tests/                     Mirrored unit and route test suites
readme/                    Security, contribution, workflow, and schema notes
swagger.json               OpenAPI 3.1 contract
```

## Security and operations

- Keep `.env*` secrets and database client keys outside version control.
- Use HTTPS at the public edge; the Node server is designed for internal HTTP behind nginx.
- Keep `OAUTH_STATE_SECRET`, OAuth client credentials, Redis credentials, and database credentials in a secret manager or CI secret store.
- Enable only the origins required by the deployment through `CORS_ALLOWED_ORIGINS`.
- Treat diagnostic flags such as `AUTH_MW_DEBUG`, `AUTH_ME_DEBUG`, and `ROUTE_LOADER_DEBUG` as development/troubleshooting controls, not production defaults.
- Monitor `/v1/health/database`, `/v1/health/memory`, and `/v1/monitor/network` alongside application logs.
- The token cleanup job runs on a configurable interval through `CLEANUP_JOB_INTERVAL_MS`.

See [`readme/SECURITY.md`](./readme/SECURITY.md) for vulnerability reporting and [`readme/EDGE_CASES_COVERAGE.md`](./readme/EDGE_CASES_COVERAGE.md) for detailed authentication edge-case coverage.

## Contributing

Read [`readme/CONTRIBUTING.md`](./readme/CONTRIBUTING.md) before opening a change. In particular:

- Prefer small route/service modules with domain errors rather than HTTP handling inside services.
- Add or update tests alongside behavior changes.
- Keep shared mocks limited to cross-cutting concerns and mock domain modules locally.
- Run `npm test`, `npm run test:coverage`, `npm run build`, and `npm run swagger:gen` as appropriate.
- Enable the tracked hooks with `npm run setup:hooks`; the pre-push hook regenerates Swagger and blocks a push if generation fails.

## License

This project is licensed under the [MIT License](./LICENSE).
