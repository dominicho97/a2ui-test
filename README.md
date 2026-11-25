# a2ui test

a2ui test is a hackathon prototype of an agentic User Acceptance Testing (UAT) assistant for enterprise dashboards. A tester explores a simulated Power BI-style dashboard while the app records the screen, collects timestamped notes and logs what the dashboard displays. An AI investigator then asks adaptive clarification questions, and the result becomes a reviewable issue report (Markdown or JSON).

> The dashboard contains a **deliberate bug**: when you change the Country filter, the charts and table update, but the Revenue KPI card keeps showing the global figure. The UI gives no hint about this. The tester is expected to notice it.

## Features

- **Dashboard under test**: KPI cards (Revenue, Units Sold, Active Customers), a revenue chart and a details table, with Country and Period filters.
- **Screen recording**: `getDisplayMedia()` and `MediaRecorder`, with replay in a local `<video>` player.
- **Unified session clock**: video, annotations and telemetry events share one monotonic clock (`0 ms` is the first recorded frame).
- **Timestamped annotations**: each note stores a raw video frame and a snapshot of the values displayed at that moment.
- **AI investigator**: an LLM (OpenAI) behind a local server endpoint, with an automatic fallback to a built-in mock investigator.
- **Issue review**: editable draft, evidence frames, clarification answers, approval stamp, and Markdown/JSON export.

## Quick start

Prerequisites: Node.js 18 or newer and npm.

```bash
npm install
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
npm run dev
```

Open the URL printed by Vite (usually <http://localhost:5173>).

The app works without an API key: the investigator falls back to the built-in mock and the UI badge shows `mock`. To use a real model, set `OPENAI_API_KEY` in `.env` and restart the dev server. See [Configuration](#configuration).

## Using the app

1. **Record & Log**: click Start and pick a screen, window or tab to share. Change the Country and Period filters and add notes (for example "Revenue looks wrong for Germany"). Each note captures a frame and the current values. Stop the recording when you are done.
2. **AI Investigator**: this tab unlocks once a recording is stopped and has at least one note. The investigator summarises what it observed and asks follow-up questions.
3. **Review Draft**: edit the title, category, severity, description and reproduction steps. Approve the draft, then copy it as Markdown or download it as JSON.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server (includes the `/api/investigate` endpoint) |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build (also includes `/api/investigate`) |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run test` | Run unit tests once with Vitest |
| `npm run test:e2e` | Run Playwright tests (see [Development](docs/development.md#end-to-end-tests)) |

Before submitting changes, `npm run lint`, `npm run build` and `npm run test` must all pass.

## Configuration

Environment variables are read from `.env` by the server process only.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | No | none | Enables the real LLM investigator. Without it the endpoint returns `503` and the app uses the mock. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Vision-capable chat model used for analysis. |

Security notes:

- Never prefix these variables with `VITE_`. Vite embeds `VITE_*` variables in the public bundle.
- `.env` and `.env.*` are git-ignored; only `.env.example` is tracked. Check with `git check-ignore -v .env`.
- Restart the dev server after editing `.env`.
- Set a spend limit on the key and rotate it if it is ever exposed.
- Screenshots of the dashboard are sent to OpenAI. The demo data is synthetic. Do not point the app at real enterprise data without approval.

## Project structure

```text
.
├── server/                    Node middleware mounted on Vite dev/preview servers
│   ├── apiPlugin.ts           Vite plugin: POST /api/investigate
│   └── investigate.ts         Request validation, OpenAI call, response validation
├── src/
│   ├── App.tsx                Workspace layout, global session state, tabs
│   ├── types.ts               Shared domain types
│   ├── components/            Dashboard, ScreenRecorder, AIInvestigatorPanel, IssueDraft
│   ├── data/salesData.ts      Synthetic data and the single source of truth for displayed values
│   ├── schemas/               zod contracts (investigation API, exported issue report)
│   ├── services/              Investigator interface, LLM and mock implementations
│   ├── utils/                 SessionClock, frame selection, issue export, ids, formatting
│   └── test/setup.ts          Vitest setup
├── docs/                      Extra documentation (see below)
├── feedbackflow-ai-plan.md    Original implementation plan
└── .env.example               Environment variable template
```

Unit tests sit next to their sources as `*.test.ts(x)`; server tests are in `server/`.

## Tech stack

React 18, TypeScript, Vite 6, Tailwind CSS, Recharts, Lucide React, zod, Vitest with Testing Library, Playwright, ESLint and Prettier.

## Documentation

- [Architecture](docs/architecture.md): modules, data flow, session clock, investigator design.
- [API reference](docs/api.md): `POST /api/investigate` request, response and error contract.
- [Issue report format](docs/issue-report.md): JSON schema and Markdown export.
- [Development guide](docs/development.md): conventions, testing, extending the app.
- [Troubleshooting](docs/troubleshooting.md): common problems and fixes.
- [Implementation plan](feedbackflow-ai-plan.md): the original design document.

## Known limitations

- The investigator's deterministic check targets one pattern: a country change where the chart total moved but the Revenue KPI did not.
- Recording is video only (no audio).
- Browser support depends on `getDisplayMedia` and `MediaRecorder`; use a current Chromium-based browser.
- `/api/investigate` is mounted by Vite plugins, so it exists only under `npm run dev` and `npm run preview`. A static host serving `dist/` has no endpoint and the app uses the mock.
- No Playwright config or E2E specs exist yet.
