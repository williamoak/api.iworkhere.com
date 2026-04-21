# api.iworkhere.com

A robust TypeScript + Express REST API backend server with database connectivity, authentication, and comprehensive testing. Designed for `https://api.iworkhere.com/v1/*` endpoints, featuring dynamic route loading, middleware enforcement, and Swagger documentation.

## Features

- **Authentication & Authorization**: Bearer token-based auth with SHA-256 hashed tokens, user registration, login, email verification, password reset, and token refresh.
- **Database Integration**: PostgreSQL with Drizzle ORM, including migrations, seeds, and mappers.
- **Middleware Stack**: CORS, rate limiting, throttling, caching, validation (Zod schemas), and debug logging.
- **Dynamic Routing**: Automatic route discovery from filesystem structure with enforced middleware order.
- **API Documentation**: Swagger UI for interactive docs.
- **Testing**: Comprehensive Vitest suite with mocks and coverage reporting.
- **Security**: bcryptjs for password hashing, environment-based configs, and debug flags for diagnostics.

## Tech Stack

- **Language**: TypeScript
- **Framework**: Express.js (v5.2.1)
- **Database**: PostgreSQL with Drizzle ORM (v0.45.1)
- **Validation**: Zod (v4.3.5)
- **Authentication**: Custom JWT-like with hashed tokens
- **Testing**: Vitest (v4.0.17) with coverage
- **Linting/Formatting**: ESLint + Prettier
- **Docs**: Swagger UI Express

## Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd api.iworkhere.com
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (see Environment Variables section).

4. Run database migrations:
   ```bash
   npm run drizzle migrate
   ```

5. Seed the database (optional):
   ```bash
   npm run seed:data
   ```

## Environment Variables

Create a `.env` file in the root directory. Required variables:

- `DB_HOST`: Database host (e.g., `localhost`)
- `DB_PORT`: Database port (e.g., `5432`)
- `DB_NAME`: Database name
- `DB_USER`: Database username
- `DB_PASSWORD`: Database password
- `HOST_IP`: Server host IP
- `NODE_ENV`: Environment (`development` or `production`)
- `API_VERSION`: API version (e.g., `v1`)
- `MAX_CONCURRENT_REQUESTS`: Max concurrent requests (e.g., `100`)
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed origins (optional)

Optional debug flags:
- `AUTH_MW_DEBUG=1`: Enable auth middleware debug logs
- `AUTH_ME_DEBUG=1`: Enable auth me debug logs
- `ROUTE_LOADER_DEBUG=1`: Enable route loader debug logs
- `DEBUG=true`: General debug mode

## Running the Application

### Development
```bash
npm run dev
```
Starts the server with hot reload. Swagger UI available at `http://<HOST_IP>:<PORT>/docs`.

### Production
```bash
npm run build
npm start
```

### Testing
```bash
npm test          # Run tests
npm run test:ui   # Run tests with UI
```

## API Endpoints

The API is versioned under `/v1`. All endpoints support JSON request/response. Authentication is required for protected routes (marked with 🔒).

### Authentication
- `PUT /v1/auth/register` - Register a new user
- `POST /v1/auth/login` - Login and get access token
- `PUT /v1/auth/refresh` - Refresh access token
- `DELETE /v1/auth/token` - Revoke token
- `GET /v1/auth/me` 🔒 - Get current user info
- `PUT /v1/auth/emailverify` - Verify email
- `PUT /v1/auth/emailverify/resend` - Resend verification email
- `PUT /v1/auth/passreset/initiate` - Initiate password reset
- `PUT /v1/auth/passreset/complete` - Complete password reset
- `GET /v1/auth/eula` - Get EULA

### Health & Monitoring
- `GET /v1/health` - Overall health check
- `GET /v1/health/database` - Database connectivity check
- `GET /v1/health/memory` - Memory usage
- `GET /v1/health/api` - API status
- `GET /v1/monitor/network` - Network monitoring

### Configuration
- `GET /v1/config` 🔒 - Get user config
- `PUT /v1/config` 🔒 - Update user config
- `DELETE /v1/config` 🔒 - Delete user config

### Warframe (Game Data)
- `GET /v1/warframe/warframes` 🔒 - List warframes
- `PUT /v1/warframe/warframes` 🔒 - Create/update warframe
- `DELETE /v1/warframe/warframes` 🔒 - Delete warframe
- `GET /v1/warframe/weapons` 🔒 - List weapons
- `PUT /v1/warframe/weapons` 🔒 - Create/update weapon
- `DELETE /v1/warframe/weapons` 🔒 - Delete weapon
- `GET /v1/warframe/modules` 🔒 - List modules
- `PUT /v1/warframe/modules` 🔒 - Create/update module
- `DELETE /v1/warframe/modules` 🔒 - Delete module

## CORS Configuration

The API allows origins matching `https://*.iworkhere.com`. Additional origins can be specified via `CORS_ALLOWED_ORIGINS`.

- Origins must include scheme and host only (e.g., `https://example.com`).
- No paths or wildcards in `CORS_ALLOWED_ORIGINS`.
- Ports are considered part of the origin.

## Middleware Order

Requests are processed through:
1. CORS
2. JSON body parsing
3. Request validation
4. Auth rate limiting (auth routes)
5. Authentication (if required)
6. Concurrency throttling
7. Caching
8. Route handler

## Database Schema

Uses Drizzle ORM with PostgreSQL. Key tables:
- `auth_tokens`: Token storage with hashes
- User-related tables (via mappers)
- Warframe data tables

Run migrations with `npm run drizzle migrate`.

## Testing

- **Framework**: Vitest
- **Coverage**: Excludes `src/services/dbService.ts`
- **Setup**: Mocks for DB, external services
- **Run**: `npm test` or `npm run test:ui`

## Scripts

- `npm run dev`: Development server
- `npm run build`: Build for production
- `npm run start`: Production server
- `npm run test`: Run tests
- `npm run test:watch`: Watch mode tests
- `npm run test:ui`: UI mode tests
- `npm run swagger:gen`: Generate Swagger docs
- `npm run seed:data`: Seed database
- `npm run lint`: Lint code
- `npm run format`: Format code

## Security Notes

- Tokens are hashed with SHA-256 before DB storage.
- Passwords use bcryptjs.
- Debug flags expose metadata—disable in production.
- Rate limiting on auth endpoints to prevent abuse.
- No sensitive data in logs by default.

## Contributing

1. Follow the project's coding standards (ESLint, Prettier).
2. Add tests for new features.
3. Update Swagger docs for API changes.
4. Use the enforced middleware order for routes.

## License

MIT

## Version

0.1.0 (Pre-release)
