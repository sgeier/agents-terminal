# Repository Guidelines

This repository is currently minimal and ready for contributors to bootstrap agent-related tooling. Use the conventions below to keep changes consistent and easy to review.

## Project Structure & Module Organization
- src/: Application/agent code grouped by feature (e.g., src/cli, src/core, src/adapters).
- tests/: Unit/integration tests mirroring src paths.
- scripts/: Developer utilities (setup, lint, release).
- docs/: Additional docs and diagrams.
- examples/ and assets/: Small runnable samples and fixtures.

Example:
```
src/
  cli/
  core/
tests/
  core/
scripts/
```

## Build, Test, and Development Commands
Prefer Makefile targets as a single entrypoint; fall back to language defaults.
- make setup: Install dependencies (e.g., npm ci or pip install -e .[dev]).
- make test: Run tests with coverage.
- make lint: Lint and format checks.
- make run: Run the local CLI/app.

Project docs: see `docs/README.md` for quickstart, UI usage, APIs, and persistence details.

If no Makefile exists, typical commands:
- Node.js: npm test, npm run dev, npm run lint
- Python: pytest -q, ruff check ., black --check .

## Coding Style & Naming Conventions
- Indentation: 2 spaces (JS/TS/JSON/YAML), 4 spaces (Python).
- Naming: camelCase functions/vars, PascalCase classes/types, kebab-case CLI names and folders.
- Formatting/Linting: Prefer Prettier + ESLint (JS/TS) or Black + Ruff (Python). Keep files small and cohesive.

## Testing Guidelines
- Frameworks: Vitest/Jest (JS/TS) or Pytest (Python).
- Structure: tests mirror src; name tests as *.test.ts or test_*.py.
- Coverage: Aim ≥80% lines/branches for changed code. Include edge cases and error paths.
- Run locally before PRs: make test (or npm test / pytest).

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style.
  - Example: feat(cli): add streaming preamble hook
- PRs: Clear description, linked issues, steps to validate, screenshots/logs when relevant. Keep diffs focused; update docs/tests alongside code.

## Security & Configuration Tips
- Never commit secrets; use .env and add .env.example.
- Minimize permissions for tokens; rotate regularly.
- Avoid network calls in tests unless mocked.
