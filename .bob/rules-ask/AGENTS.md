# Documentation & Architecture Context (Ask Mode)

This file provides structural context for information retrieval and explanation tasks in this repository.

## Contextual Layout
- **Root Directory**: Empty scaffold awaiting implementation. All configuration files (tsconfig.json, vite.config.ts, playwright.config.ts) must be placed in the project root.
- **Web App / UI Source**: Located under `src/` for React application files and custom hooks.
- **Testing Directory**: `tests/e2e/` contains Playwright E2E automation tests and Page Object Models (POMs).
- **Core Architecture Reference**:
  - UI state and routing are client-side only (Vite single-page application pattern).
  - API services are centralized in `src/api/` or `src/services/` to enforce modularity.
