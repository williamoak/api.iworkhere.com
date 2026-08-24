# api.iworkhere.com

[![CI](https://github.com/williamoak/api.iworkhere.com/actions/workflows/ci.yml/badge.svg)](https://github.com/williamoak/api.iworkhere.com/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-Vitest-brightgreen)](./coverage)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A robust, enterprise-ready TypeScript + Express REST API backend server with PostgreSQL connectivity, Drizzle ORM, multi-tenant architecture, dynamic localization, comprehensive authentication, centralized caching, health monitoring, and automated test coverage.

---

## Features

- **Authentication & Authorization**: Bearer token-based auth with SHA-256 hashed tokens, user registration, login, Google OAuth 2.0, email verification, password reset workflows with password history tracking, account upgrade, and token rotation / revocation.
- **Dynamic Localization & In-Memory Caching**: High-performance localization system backed by PostgreSQL (`localizations` table) and cached dynamically in memory (`@cache/localizationCache`). Features dialect and ISO candidate fallback resolution (e.g., Canadian English `en_ca`, Canadian French `can_fr`, US English `en_us`), automatic request-level language detection (`localMiddleware`), and full CRUD endpoints (`GET`, `PUT`, `DELETE` `/v1/localization`) that automatically invalidate and dirty the cache.
- **Multi-Tenant Architecture**: Host and subdomain-based tenant resolution (`tenantMiddleware`, `tenantResolver`), application origin management (`application_origins`), and scoped tenant database transactions.
- **Centralized Caching Layer**: Extensible cache store (`src/cache/cacheStore.ts`) supporting multi-level in-memory and Redis-backed storage with domain-specific cache modules and automatic invalidation.
- **User & Tenant Configuration**: Key-value configuration API (`/v1/config`) with full CRUD support for user preferences and system settings.
- **Health Checks & Telemetry Monitoring**: Real-time system monitoring endpoints (`/v1/health`, `/v1/health/api`, `/v1/health/database`, `/v1/health/memory`, `/v1/monitor/network`, and `/v1/monitor/visit`).
- **Domain & Game Data Services**: Warframe entity management endpoints for warframes, weapons, and modules (`/v1/warframe/*`).
- **Dynamic Route Loading**: Automatic filesystem-based route discovery matching HTTP method files (`GET.ts`, `POST.ts`, `PUT.ts`, `DELETE.ts`) with strictly enforced middleware ordering and schema validation.
- **Modular Middleware Pipeline**: Enforced execution pipeline including CORS, rate limiting, exponential backoff, concurrency throttling, Zod validation, tenant resolution, localization, cache middleware, and structured logging.
- **Email Delivery & Audit Logging**: Integrated email delivery via Brevo API and Nodemailer with database audit logging (`email_audit_logs`).
- **Web Interfaces & Dashboards**: Built-in root onboarding page (`/`), administrative dashboard (`/admin`), interactive Swagger UI documentation (`/docs`), and browser-accessible test coverage reports (`/coverage`).
- **Database & Migrations**: PostgreSQL with Drizzle ORM, versioned SQL migrations, seed data pipelines, relational mappers, and maintenance scripts.
- **Automated Testing**: Extensive Vitest test suite covering route handlers, middleware, caching, services, schemas, and database mappers.

---

## Tech Stack

- **Language & Runtime**: TypeScript 5.x, Node.js (v24+)
- **Web Framework**: Express.js (v5.x)
- **Database**: PostgreSQL with Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Validation**: Zod (v4.x)
- **Caching**: Centralized In-Memory Store & Redis (`ioredis`)
- **Authentication**: SHA-256 Hashed Tokens, bcryptjs, Google OAuth 2.0
- **Email Delivery**: Brevo API (`@getbrevo/brevo`), Nodemailer
- **Testing**: Vitest with V8 coverage reporting
- **API Documentation**: Swagger UI Express & dynamic OpenAPI generator
- **Linting & Formatting**: ESLint + Prettier

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd api.iworkhere.com
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy `.env.example` to `.env` and update the required values:
   ```bash
   cp .env.example .env
   ```

4. **Run database migrations:**
   ```bash
   npm run drizzle:apply
   ```

5. **Seed the database (optional):**
   ```bash
   npm run seed:data
   ```

---

## Environment Variables

Create a `.env` file in the project root. Key configuration variables:

### Database & Server
- `DB_HOST`: Database host (e.g., `localhost` or PostgreSQL container)
- `DB_PORT`: Database port (default: `5432`)
- `DB_NAME`: Database name
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `HOST_IP`: Server host IP (e.g., `127.0.0.1` or `0.0.0.0`)
- `PORT`: Server listening port (default: `4300`)
- `NODE_ENV`: Environment mode (`development`, `production`, `test`)
- `API_VERSION`: API version prefix (default: `v1`)
- `MAX_CONCURRENT_REQUESTS`: Maximum concurrent requests before throttling (e.g., `100`)

### CORS & Security
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins (e.g., `https://iworkhere.com,https://app.iworkhere.com`)
- `AUTH_TOKEN_SECRET`: Secret key for token generation and signing
- `GOOGLE_CLIENT_ID`: Google OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 client secret
- `GOOGLE_CALLBACK_URL`: Google OAuth 2.0 callback URL

### Email & Notifications
- `BREVO_API_KEY`: Brevo API key for transactional emails
- `SMTP_HOST`: SMTP host (fallback)
- `SMTP_PORT`: SMTP port
- `SMTP_USER`: SMTP user
- `SMTP_PASS`: SMTP password
- `EMAIL_FROM`: Default sender email address

### Optional Debug Flags
- `AUTH_MW_DEBUG=1`: Enable authentication middleware debug logging
- `AUTH_ME_DEBUG=1`: Enable `/v1/auth/me` debug logging
- `ROUTE_LOADER_DEBUG=1`: Enable dynamic route loader discovery logging
- `DEBUG=true`: General application debug mode

---

## Running the Application

### Development Mode
Starts the server with hot reload and file watching:
```bash
npm run dev
```

### Production Build & Execution
Compile TypeScript to `dist/` and run the production server:
```bash
npm run build
npm start
```

### Testing & Code Quality
```bash
npm test             # Run test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage# Generate test coverage report
npm run test:ui      # Launch interactive Vitest UI
npm run lint         # Run ESLint across TypeScript source files
npm run format       # Format code with Prettier
```

---

## Web Interfaces

When the server is running, the following web interfaces and dashboards are accessible:

- **Welcome Page**: `http://<HOST_IP>:<PORT>/` — Root landing and onboarding page.
- **Admin Dashboard**: `http://<HOST_IP>:<PORT>/admin` — Secure administrative web interface.
- **API Documentation**: `http://<HOST_IP>:<PORT>/docs` — Interactive Swagger UI.
- **Test Coverage**: `http://<HOST_IP>:<PORT>/coverage` — Browseable test coverage dashboard.

---

## API Endpoints Reference

All API routes are versioned under `/v1` and use standard JSON request/response formats. Endpoints requiring an authentication bearer token are marked with 🔒.

### 1. Authentication & Account Management (`/v1/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `PUT` | `/v1/auth/register` | No | Register a new user account and dispatch verification email |
| `POST` | `/v1/auth/login` | No | Authenticate user credentials and return bearer token |
| `PUT` | `/v1/auth/refresh` | No | Refresh an active access token |
| `DELETE` | `/v1/auth/token` | No | Revoke active bearer token (logout) |
| `GET` | `/v1/auth/me` | 🔒 | Retrieve authenticated user profile, roles, and status |
| `GET` | `/v1/auth/emailverify` | No | Verify user email address via query token |
| `PUT` | `/v1/auth/emailverify` | No | Verify user email address via body payload |
| `PUT` | `/v1/auth/emailverify/resend` | No | Resend account verification email |
| `PUT` | `/v1/auth/passreset/initiate` | No | Request password reset token via email |
| `PUT` | `/v1/auth/passreset/verify` | No | Validate password reset token validity |
| `PUT` | `/v1/auth/passreset/complete` | No | Complete password reset and record history |
| `GET` | `/v1/auth/oauth/google` | No | Initiate Google OAuth 2.0 authentication flow |
| `GET` | `/v1/auth/oauth/google/callback` | No | Google OAuth 2.0 redirect callback handler |
| `PUT` | `/v1/auth/upgrade` | 🔒 | Upgrade account tier or permissions |
| `GET` | `/v1/auth/eula` | No | Retrieve End User License Agreement text |

### 2. Localization (`/v1/localization`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/v1/localization?slug=...&lang=...` | No | Resolve localized string with automatic dialect/ISO fallback |
| `GET` | `/v1/localization?slug=...` | No | Return comma-delimited list of supported language codes for a slug |
| `GET` | `/v1/localization?lang=...` | No | Return comma-delimited list of supported slug names for a language |
| `GET` | `/v1/localization?id=...` | No | Retrieve a single localization record by UUID |
| `PUT` | `/v1/localization` | 🔒 | Create or update a localization record (automatically invalidates cache) |
| `DELETE` | `/v1/localization` | 🔒 | Delete a localization record by ID or slug/lang (automatically invalidates cache) |

### 3. User & System Configuration (`/v1/config`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/v1/config` | 🔒 | Retrieve user/tenant configuration key-value pairs |
| `PUT` | `/v1/config` | 🔒 | Upsert user/tenant configuration entries |
| `DELETE` | `/v1/config` | 🔒 | Delete configuration entries by key or ID |

### 4. Health & System Monitoring (`/v1/health` & `/v1/monitor`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/v1/health` | No | Overall system health status check |
| `GET` | `/v1/health/api` | No | API service availability and version check |
| `GET` | `/v1/health/database` | No | PostgreSQL database connectivity and pool health |
| `GET` | `/v1/health/memory` | No | System and Node.js process memory usage telemetry |
| `GET` | `/v1/monitor` | No | General monitoring status |
| `GET` | `/v1/monitor/network` | No | Network latency and connectivity metrics |
| `POST` | `/v1/monitor/visit` | No | Record visitor analytics and telemetry |
| `GET` | `/v1/readme` | No | Fetch parsed HTML and line count of project README |

### 5. Game Data / Warframe Services (`/v1/warframe`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/v1/warframe/warframes` | 🔒 | List warframe records (supports filtering) |
| `PUT` | `/v1/warframe/warframes` | 🔒 | Create or update warframe data |
| `DELETE` | `/v1/warframe/warframes` | 🔒 | Delete warframe records |
| `GET` | `/v1/warframe/weapons` | 🔒 | List weapon records |
| `PUT` | `/v1/warframe/weapons` | 🔒 | Create or update weapon data |
| `DELETE` | `/v1/warframe/weapons` | 🔒 | Delete weapon records |
| `GET` | `/v1/warframe/modules` | 🔒 | List module records |
| `PUT` | `/v1/warframe/modules` | 🔒 | Create or update module data |
| `DELETE` | `/v1/warframe/modules` | 🔒 | Delete module records |

---

## Localization & Middleware Usage

### Middleware Architecture
Every incoming HTTP request traverses a strictly ordered middleware pipeline:
1. **CORS**: Enforces origin validation (`https://*.iworkhere.com` and custom allowed origins).
2. **Body & Cookie Parsing**: JSON body parsing with payload size limits and cookie extraction.
3. **Tenant Resolution**: Resolves tenant application context from headers/subdomains.
4. **Localization Middleware**: Detects request language from query parameters (`?lang=...`), cookies, or `Accept-Language` / `X-Lang` headers, attaching helper methods `req.t`, `req.lang`, and `res.locals.t`.
5. **Rate Limiting & Backoff**: Protects authentication and public endpoints from abuse.
6. **Authentication**: Validates bearer tokens against hashed database records for protected routes.
7. **Concurrency Throttling**: Regulates concurrent active connections to prevent server overload.
8. **Caching Middleware**: Transparent response caching for cache-enabled endpoints.
9. **Zod Validation**: Validates `params`, `query`, and `body` against strongly-typed schemas.
10. **Route Handler**: Executes the endpoint handler.

### Using Localization in Route Handlers
```typescript
import type { Request, Response } from 'express';

export default async function GET(req: Request, res: Response) {
    // Automatically uses language detected on the request
    const welcomeText = await req.t('welcome_message');
    
    // Explicit language override with fallback string
    const buttonText = await req.t('submit_btn', 'can_fr', 'Soumettre');

    return res.json({ welcomeText, buttonText });
}
```

### Direct Backend Helper Call
```typescript
import { getLocalization } from '@middleware/localMiddleware';

// Direct resolution outside HTTP context
const message = await getLocalization('login_title', 'en_ca');
```

---

## Database Architecture & Drizzle ORM

The project uses Drizzle ORM with PostgreSQL. Key database schemas include:
- `users`, `user_statuses`: Core user profile and state management.
- `auth_tokens`: Active session tokens with SHA-256 hash storage.
- `user_auth_local`, `user_auth_oauth`: Password credentials and OAuth identity mappings.
- `user_password_history`: Tracks past passwords to enforce rotation policies.
- `email_verification_tokens`, `password_reset_tokens`, `password_reset_requests`: Security tokens for account recovery.
- `localizations`: Multi-language string repository.
- `applications`, `application_origins`, `user_applications`: Multi-tenant application registries and permissions.
- `config`: User and tenant key-value configuration storage.
- `email_audit_logs`: Audit trail for dispatched transactional emails.
- `visit_info`: Visitor analytics and telemetry logs.
- `warframes`, `weapons`, `modules`: Game data entity schemas.

### Database Tooling & Scripts
- `npm run drizzle:generate`: Generate new SQL migrations from Drizzle schema files.
- `npm run drizzle:apply`: Apply pending migrations to the PostgreSQL database.
- `npm run drizzle:check`: Check schema consistency.
- `npm run seed:data`: Populate initial seed data across all schemas.
- `npm run userclean`: Maintenance script to clean up orphaned or expired user test records.

---

## Security & Best Practices

- **Token Security**: Tokens are never stored in plaintext in the database; only SHA-256 hashes are persisted.
- **Password Security**: Passwords are encrypted using `bcryptjs` with salt rounds.
- **Tenant Isolation**: Tenant contexts are enforced at the middleware and transaction levels.
- **Rate Limiting**: Auth endpoints enforce rate limits and exponential backoff to prevent brute-force attacks.
- **Sanitized Logging**: Sensitive credentials and tokens are redacted from logging outputs.

---

## License

This project is licensed under the MIT License — see `LICENSE` for details.
