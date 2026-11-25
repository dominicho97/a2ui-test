# Development guide

## Setup

```bash
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and set `OPENAI_API_KEY` (see the [README](../README.md#configuration)).

## Quality gate

Run all three before submitting changes:

```bash
npm run lint
npm run build
npm run test
```

`npm run format` runs Prettier over the repository.

## Conventions

These come from [`AGENTS.md`](../AGENTS.md).

- **Selectors**: put a `data-testid` on every interactive element. Do not use class names or XPath in tests.
- **Imports**: use the `@/` alias (for example `@/components/*`, `@/utils/*`) instead of `../../`. Order them as external dependencies, aliased internals, types, then style assets.
- **Types**: strict null checks are on. Give exported functions and component props explicit types. Do not use `any`; use `unknown` for dynamic data.
- **Errors**: no empty `catch` blocks. Log every caught error.
- **State**: use pure updater functions with `useState` (`setX((prev) => ...)`) so async work cannot race.
- **Contracts**: validate every API or external payload with zod before it reaches application state.

## Testing

### Unit tests (Vitest)

```bash
npm run test                         # all tests, once
npx vitest run src/utils/issueExport.test.ts
npx vitest run -t "test name"
```

- Config is in [`vite.config.ts`](../vite.config.ts): `jsdom` environment, globals on, setup file `src/test/setup.ts`.
- Included: `src/**/*.test.{ts,tsx}` and `server/**/*.test.ts`.
- Component tests live next to the component (`MyComponent.tsx` and `MyComponent.test.tsx`).
- Browser APIs such as `getDisplayMedia` and `MediaRecorder` must be mocked in tests.
- Use the injection points instead of real network access or real time: `LlmAIInvestigator` and `handleInvestigate` accept a `fetchImpl`, `SessionClock` accepts a `TimeSource`, and `buildIssueReport` takes `now`.

### End-to-end tests (Playwright)

No Playwright config or specs exist yet. When adding them:

- Put specs in `tests/e2e/`.
- Run with `npm run test:e2e`, `npx playwright test <file>` or `npx playwright test -g "name"`.
- Never run against live production or staging systems. Mock external traffic with `page.route()` (for example `/api/investigate`) or Mock Service Worker.
- Screen capture needs a browser permission prompt. In Chromium, use flags such as `--use-fake-ui-for-media-stream` and `--auto-select-desktop-capture-source` instead of relying on a human.

## Common tasks

### Add a new dashboard metric

1. Extend `getDashboardMetrics` in [`src/data/salesData.ts`](../src/data/salesData.ts).
2. If the investigator should see it, add it to `TelemetrySnapshot` in [`src/types.ts`](../src/types.ts) and to `TelemetrySnapshotSchema` in [`src/schemas/investigation.ts`](../src/schemas/investigation.ts). Mind the string length limits.
3. Update `getTelemetrySnapshot` so the snapshot is derived from the same function as the render.
4. Update the report schema and Markdown renderer if the value should be exported.

### Add or change a mock investigator question

Edit `buildAnalysis` and `getNextAdaptiveQuestion` in [`src/services/AIInvestigatorService.ts`](../src/services/AIInvestigatorService.ts). Question ids drive the follow-up tree.

### Detect a new kind of inconsistency

`findStaleKpiEvidence` compares displayed values between consecutive events. Add a similar function that only uses observed snapshots, then pass its result as grounding (`deterministicFinding`) and extend the request schema if the shape differs. Do not add a hidden reference value.

### Change the LLM prompt or model settings

Edit `SYSTEM_PROMPT`, `ANALYZE_INSTRUCTIONS`, `NEXT_INSTRUCTIONS` and the request body in [`server/investigate.ts`](../server/investigate.ts). Keep the output schemas in `src/schemas/investigation.ts` in sync and update `server/investigate.test.ts`.

### Swap in a different investigator

Implement `AIInvestigatorService` and export it from [`src/services/investigatorService.ts`](../src/services/investigatorService.ts).

### Change the export format

Update `IssueReportSchema`, `buildIssueReport` and `renderIssueMarkdown` together. Increment `ISSUE_REPORT_SCHEMA_VERSION` for breaking changes.

## Security checklist

- The API key is only read in `vite.config.ts` and passed to the server plugin. Do not add it to `define` and do not use a `VITE_` prefix.
- Server error responses stay generic. Do not log or return upstream bodies, headers or the key.
- Treat tester notes and event text as untrusted input in prompts.
- After a build, confirm that `dist/` contains no key material.
