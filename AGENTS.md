# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Repository Context
- This is a newly initialized TypeScript-based UI and/or automated UI testing (`a2ui-test`) repository.
- Standard Stack: TypeScript, React, Vite, Tailwind CSS, Vitest (unit), Playwright (E2E).

## Build & Test Commands
- **Build**: `npm run build` (Type-checks and compiles code)
- **Lint**: `npm run lint` (Checks for styling/formatting issues via ESLint)
- **Format**: `npm run format` (Runs Prettier formatter)
- **Unit Tests**:
  - All tests: `npm run test` or `npx vitest`
  - Single file: `npx vitest run <path_to_file>`
  - Single test matching pattern: `npx vitest run -t "test name"`
- **E2E Tests**:
  - All E2E: `npx playwright test`
  - Single E2E file: `npx playwright test <path_to_file>`
  - Specific E2E test by name: `npx playwright test -g "test-name-pattern"`

## Critical Conventions & Style
- **Selectors**: Always use explicit `data-testid` attributes on interactive elements. Avoid class-name/XPath selectors in E2E tests.
- **Imports**: Avoid relative paths like `../../`. Use absolute alias paths (e.g., `@/components/*`, `@/hooks/*`, `@/utils/*`).
- **Imports Order**: 1. External dependencies, 2. Path-aliased internals, 3. Types, 4. Style assets.
- **Types**: Strict null checks are enabled. Explicitly define return types for exported functions and component props. Never use `any`; use `unknown` if the type is dynamic.
- **Error Handling**: Never use empty catch blocks. Log all caught errors to a central logger or diagnostic output.
