# Contributing

Thanks for considering contributing to this project. This document explains the preferred developer workflow, testing and mocking conventions, and how to set up local git hooks contained in the repository.

Getting started

1. Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd api.iworkhere.com
npm ci
```

2. (Optional) Enable the tracked hooks in `.github/hooks` for this clone. Run once per clone:

```bash
npm run setup:hooks || git config core.hooksPath .github/hooks
```

3. Copy environment example and edit as needed:

```bash
cp .env.example .env
# edit .env
```

Testing

- Run the unit tests:

```bash
npm test
```

- Run tests in watch mode during development:

```bash
npm run test:watch
```

Mocking conventions

- `tests/vitest.setup.ts` contains global, environment-level mocks (filesystem, dotenv, DB safety stubs, etc.). Keep that file limited to cross-cutting concerns only.
- Do NOT globally mock modules that have their own unit tests (e.g. core services). Instead, mock such modules locally in the route or integration test file before importing the module-under-test. Example:

```ts
vi.mock('@services/auth/authUserResolver', () => ({ __esModule: true, resolveUserForApplication: vi.fn() }));
import { app } from '../../app'; // import after mocking
```

- When a test needs the real implementation of a module that is globally mocked, use `vi.importActual()` inside the test to acquire the real implementation.

Pre-push hooks

This repository includes a tracked hook under `.github/hooks/pre-push` that runs `npm run swagger:gen` and aborts the push if generation fails. To enable the tracked hooks for your local clone run the setup command above.

Commit message guidelines

- Use present-tense, short subject lines (50 chars or less) and include a body if needed.
- Reference the issue or ticket number when applicable.

Reporting issues

- Open an issue in GitHub and provide reproduction steps, the expected behavior, and any relevant logs or stack traces.

Thank you for contributing!
