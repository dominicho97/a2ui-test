# Troubleshooting

## The investigator badge says `mock`, not `llm`

The app fell back to the built-in investigator. Check, in order:

1. `.env` exists and contains `OPENAI_API_KEY=...`.
2. You restarted `npm run dev` after editing `.env`. The key is read when the server starts.
3. You are on `npm run dev` or `npm run preview`. A static host serving `dist/` has no `/api/investigate`.
4. The browser console ("LLM analysis unavailable...") and the terminal (a generic `[investigate]` line).
5. Call the endpoint directly (see [api.md](api.md#example)).

| `/api/investigate` status | Meaning |
| --- | --- |
| 503 | No API key configured |
| 502 | Upstream failure (bad key, quota, model name) or unusable model reply |
| 504 | The model took longer than 30 s |
| 413 | Payload over 6 MB (too many or too large frames) |
| 400 | Request failed validation |

The server deliberately does not return upstream error details. A wrong key or model name shows up as a `502` plus a status line in the terminal.

## The AI Investigator tab is disabled

It unlocks only when the recording is **stopped** and has **at least one note**. Add a note while recording, then press Stop.

## The Review Draft tab is disabled

It unlocks after the investigation finishes (the compile-issue button in the investigator panel).

## Screen sharing does not start

| Error | Fix |
| --- | --- |
| `NotAllowedError` | Permission was denied. Allow screen capture for the site and try again. |
| `NotFoundError` | No capturable source was available. |
| `NotReadableError` | The OS or another app is blocking capture. Check OS screen-recording permissions. |
| `AbortError` | The picker was closed or capture was interrupted. Start again. |
| Unsupported browser | Use a current Chromium-based browser. `getDisplayMedia` and `MediaRecorder` are required. |

On failure the recorder stays `idle`, so you can retry.

## The recording ended by itself

Clicking the browser's "Stop sharing" button or revoking permission ends the recording. The partial recording is saved and a notice explains it. You can still investigate it.

## No video player after stopping

The recorder produced no data, for example because it was stopped immediately. A message is shown instead of a blank player. Record again for a few seconds.

## Annotation timestamps look off

All times use the shared `SessionClock`, where `0` is the first recorded video frame. Time spent paused, or while the shared window was minimised (muted track), is not counted. This is expected.

## `getDisplayMedia` or `MediaRecorder` is undefined in tests

jsdom does not implement them. Mock them in the test, as `ScreenRecorder.test.tsx` does.

## The build fails with a type error

`npm run build` runs `tsc -b` before `vite build`. Fix type errors first. Strict null checks are enabled and `any` is not allowed.

## `npm run lint` reports import problems

Use the `@/` alias instead of relative paths such as `../../`, and keep the import order: external, aliased internals, types, styles.

## Windows PowerShell notes

- Copy the env template with `Copy-Item .env.example .env`.
- Chain commands with `;`, not `&&`, in Windows PowerShell 5.1.
