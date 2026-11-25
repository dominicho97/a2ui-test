# Advanced Coding Rules (Agent Mode)

This file provides guidance to coding agents operating in this repository.

## Project Coding Rules
- **Safe State Mutation**: Always use pure updater functions with `useState` or context-based state to prevent race conditions during async operations.
- **Defensive API Schema Validation**: Every API or external contract integration must be validated at runtime using a schema library (like `zod`) before being processed by application state.
- **Deterministic E2E Testing**:
  - Never run E2E tests against live production/staging databases directly.
  - Utilize Mock Service Worker (MSW) or Playwright's network interception (`page.route()`) to mock external network traffic.
- **File Placement**:
  - Component unit tests must live next to their source files (e.g. `src/components/MyComponent.tsx` and `src/components/MyComponent.test.tsx`).
  - End-to-end (E2E) feature specs must live within `tests/e2e/`.
- **Pre-commit Quality Gate**: Before submitting changes, you must successfully execute:
  1. `npm run lint`
  2. `npm run build`
  3. `npm run test`
