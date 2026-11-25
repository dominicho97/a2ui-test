# FeedbackFlow AI - Implementation Plan (Revised)

This document outlines the structured architecture, components, and implementation phases for **FeedbackFlow AI**, a hackathon prototype of an agentic User Acceptance Testing (UAT) assistant for enterprise dashboards.

## High-Level Overview
FeedbackFlow AI connects a simulated interactive Power BI-style dashboard with real browser screen-recording, custom timestamped annotations, structured state telemetry tracking, an adaptive AI Investigator (A2UI-inspired dynamic forms), and a structured issue generator with real video frame evidence capture.

---

## 1. Tech Stack & Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind CSS.
- **UI & Iconography**: Tailwind CSS + Lucide React.
- **Charts**: Recharts (for realistic Power BI dashboards).
- **Screen Recording**: HTML5 `getDisplayMedia()` + `MediaRecorder` API with a local Blob-based `<video>` replay system.
- **Telemetry System**: Unified session timeline tracking for:
  - User click/interaction events.
  - State telemetry (Country, Period, Revenue KPI value, Chart values).
  - Video frame evidence generation (drawn onto hidden `<canvas>` at annotation timestamps).
- **A2UI Schema Compatibility**: An "A2UI-inspired schema with a clear adapter path" for future compatibility with Google's formal Agent-to-User Interface specification.

---

## 2. Component Design & Core Modules

### Module A: Application Workspace & Layout (`src/App.tsx`, `src/types.ts`)
- Holds global workspace state.
- Split-screen workspace: Left panel displays the Power BI Dashboard. Right panel handles controls:
  - **UAT Controller Panel**: Recording state, Timer, and Annotator.
  - **AI Investigator Panel**: Dynamic adaptive clarification questionnaires.
  - **Issue Review Panel**: Pre-filled draft with timeline, real visual frames, and Markdown/JSON export capabilities.

### Module B: Power BI Dashboard Simulation (`src/components/Dashboard.tsx`)
- Standard Power BI look and feel (yellow headers, cards, grid layout).
- **KPI cards**:
  - Revenue KPI (broken under Country filter).
  - Units Sold (works perfectly).
  - Active Customers (works perfectly).
- **Interactive Filters**:
  - Country filter (e.g., USA, Germany, Japan, UK).
  - Reporting Period (Q1, Q2, Q3, Q4).
- **The Deliberate Bug**:
  - Filtering by period or updating data works perfectly.
  - BUT when changing the Country filter, the charts and details table update correctly, while the **Revenue KPI card keeps showing the global figure** for the selected period instead of the country-specific revenue.
- **No tells in the client UI**: the dashboard shows no "mismatch" badge, warning, "correctly filtered" caption or "calculation ledger" label, and the evidence frames carry no defect-specific overlay. The tester must notice the defect themselves; diagnostic detail lives only in the internal event log and the investigator panel.
- **One source of truth** (`src/data/salesData.ts`): the dashboard render and the telemetry snapshot are both derived from the same function, so telemetry always records *what is on screen*.

### Module C: Screen Recorder & Unified Timeline (`src/components/ScreenRecorder.tsx`, `src/utils/sessionClock.ts`)
- Secure video capture via `getDisplayMedia()` (video only), saving captured data chunks as a Blob.
- **One session clock** (`SessionClock`) shared by the recording, annotations and telemetry events:
  - Backed by `performance.now()` (monotonic), never by counting `setInterval` ticks; the on-screen timer is display-only and re-reads the clock.
  - Started from `MediaRecorder.onstart`, so `0 ms` is the first recorded video frame, not the moment "Start" was clicked.
  - Follows the recorder's real state: `onpause`/`onresume` pause and resume the clock, and a muted capture track (e.g. shared window minimised) pauses recorder and clock together, so paused spans never skew timestamps.
  - Frozen on stop; `reset()` clears it. Video seeking uses `sessionMs / 1000`.
- Timeline data:
  ```typescript
  interface Annotation {
    id: string;
    sessionMs: number; // shared session clock, 0 = first video frame
    timestampStr: string; // e.g. "00:14"
    text: string;
    capturedFrameUrl?: string; // raw frame from the live video (no overlay)
    telemetrySnapshot: TelemetrySnapshot; // values as displayed
  }

  interface TelemetryEvent {
    id: string;
    sessionMs: number; // same clock
    type: 'recording_started' | 'filter_changed' | 'annotation_added' | 'recording_paused'
        | 'recording_resumed' | 'capture_interrupted' | 'capture_resumed' | 'recording_stopped';
    detail?: string;
    snapshot: TelemetrySnapshot;
  }
  ```
  An annotation's timestamp, frame and telemetry snapshot are all taken in the same synchronous step.
- The event log is internal state in `App`; it is passed to the investigator and is never rendered in the client dashboard.
- **Stream and permission handling**:
  - Browser "Stop sharing" or revoked permission fires `track.onended`; this goes through the same `finishRecording()` path as the Stop button, so the partial recording is saved and a notice explains why it ended.
  - `getDisplayMedia` failures (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `AbortError`, unsupported browser) map to specific messages and leave the recorder in `idle`.
  - A recorder that produced no data does not get a blank player; the user sees an explanatory message instead.
- **Resource cleanup**:
  - Every track is stopped and its `onended`/`onmute`/`onunmute` handlers are detached on stop, reset and unmount; the hidden capture `<video>` is paused and its `srcObject` cleared.
  - The recording's Blob URL is owned by the recorder: revoked on reset, before a new recording replaces it, and on unmount. Report downloads revoke their own URL after the click.
  - Long-lived recorder/track handlers read the latest props through refs, avoiding stale closures.
- Replay: Interactive video player with annotation list. Clicking an annotation jumps the video to `sessionMs`.

### Module D: Service-Isolated AI Investigator & Adaptive A2UI (`src/services/AIInvestigatorService.ts`)
- Strict separation behind a service interface:
  ```typescript
  export interface AIInvestigatorService {
    analyzeTelemetry(annotations: Annotation[], events: TelemetryEvent[]): Promise<InvestigationAnalysis>;
  }
  ```
- **No reference ledger dependency.** The investigator never assumes it can read a ground-truth total. That works in the simulated dashboard but not for real enterprise reports (e.g. Power BI), where only what is rendered is observable. Detection is based on **observed behaviour between logged events**:
  - A country filter change where the chart total moved but the Revenue KPI string did not (`findStaleKpiEvidence`).
  - Findings are phrased as "two views of the same filter state responded differently", with the session times of the two observations, not "the correct value is X".
  - Tester annotation keywords are only a secondary hint (they select a generic follow-up question when no inconsistency was observed).
  - A real-application adapter only has to produce `TelemetrySnapshot` values by reading visible report values (visual text, exported visual data, or on-screen OCR); the investigator code does not change.
- **Adaptive A2UI Engine**: Generates customized questioning paths:
  - Selects questions dynamically based on observed telemetry evidence, falling back to keyword hints.
  - Evaluates user answers to spawn adaptive follow-up questions. For instance:
    - *Question 1*: "How should the Revenue KPI card respond when filtering by Germany?" (Options: recalculate for the country, always global, show both)
    - *If 'recalculate'*: *Question 2*: "Should every KPI card respond to the Germany filter in the same way?"
- **Real LLM behind the same interface** (`LlmAIInvestigator`, wired in `src/services/investigatorService.ts`):
  - The browser posts to `POST /api/investigate`, a small server middleware (`server/apiPlugin.ts` + `server/investigate.ts`) mounted on the Vite dev and preview servers. Only that Node process reads `OPENAI_API_KEY`; it is never in `define`, never `VITE_`-prefixed, and never sent to the client. A build-time scan of `dist/` confirms no key material is bundled.
  - Input to the model: tester notes, the internal event log, the deterministic `findStaleKpiEvidence` result as grounding, the dialogue so far, and up to 3 downscaled JPEG evidence frames (`detail: low`). Notes and event text are passed inside a JSON facts block and the system prompt marks them as untrusted data.
  - Output is JSON validated with `zod` on the server (`src/schemas/investigation.ts`) and again in the browser. The model is told it has no ground-truth data and must describe observations and ask the tester, not assert correct values.
  - Follow-up questions are chosen by the model from the answers so far (`getNextQuestion`), capped at 3 follow-ups server-side to bound cost.
  - **Fallback:** timeout, HTTP error, network failure or schema mismatch falls back to `MockAIInvestigator`. Every result carries `source: 'llm' | 'mock'` and the panel badge shows which engine answered, so a fallback is never presented as the model.
  - Server errors are generic (no upstream bodies, headers or key in responses or logs).

#### Setup (API key)
1. `.gitignore` ignores `.env` and `.env.*` (only `.env.example` is tracked). Verify with `git check-ignore -v .env`.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY=` (and optionally `OPENAI_MODEL=`, default `gpt-4o-mini`). Never use a `VITE_` prefix.
3. Restart `npm run dev` after editing `.env` (the key is read when the server starts).
4. Set a spend limit on the key in the OpenAI dashboard. Rotate the key if it is ever exposed.
5. Note: screenshots of the dashboard are sent to OpenAI. This is synthetic data in the demo; do not point it at real enterprise data without approval.

### Module E: Issue Draft & Tester Review (`src/components/IssueDraft.tsx`)
- Comprehensive review card:
  - Editable Title, Category, Severity, Description, and Reproduction steps.
  - Raw video frame captures (no overlay) with their session timestamps.
  - Embedded answers from the adaptive A2UI session.
  - Approve/revoke verification; approval time is stamped and exported.
- Export options (both built from one validated report object, so they cannot disagree):
  - Copy GitHub-flavored Markdown.
  - Download structural UAT report as JSON.
- Export contents (`src/schemas/issueReport.ts`, built by `src/utils/issueExport.ts`):
  - Report metadata, verification status and approval timestamp, schema version.
  - Investigator engine (`llm` or `mock`) for the opening analysis and the latest follow-up, plus its summary.
  - All clarification answers.
  - Session duration, counts, every annotation with `sessionMs` and `mm:ss`, and the full telemetry event log.
  - The observed stale-KPI evidence window (country change, chart moved, KPI did not) when one exists.
  - Screenshots are not embedded (large base64); each annotation only records whether a frame was captured.

---

## 3. Implementation Plan & Deliverables

- [x] **Step 1: Codebase Scaffolding & Initial Configuration** (Setting up `package.json`, TypeScript configs, Vite config, and Tailwind CSS).
- [x] **Step 2: Interactive Power BI Simulation with Target Bug** (Implementing custom dashboard with synthetic business metrics and the broken Revenue KPI behavior, with no visible tells).
- [x] **Step 3: Unified Recording & Annotation Session Timeline** (Shared `SessionClock`, real video capture, stream-ended/permission handling, track and Blob URL cleanup, timestamped annotations, internal telemetry event log, raw frame snapshots).
- [x] **Step 4: AI Investigator Service & Adaptive A2UI Questioning Engine** (Decoupled interface; evidence derived from observed events rather than a reference ledger).
- [x] **Step 5: Tester Issue Review Board & Document Exporters** (Review layout; Markdown and JSON exports carry the full investigation context, session timestamps, telemetry events, clarification answers and verification status).
