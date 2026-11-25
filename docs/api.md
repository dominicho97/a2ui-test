# API reference: `POST /api/investigate`

A local endpoint mounted by the Vite plugin in [`server/apiPlugin.ts`](../server/apiPlugin.ts) on `npm run dev` and `npm run preview`. It exists only on those servers, not on a static host.

The contract is defined with zod in [`src/schemas/investigation.ts`](../src/schemas/investigation.ts) and shared by the browser, the server and the model output check.

## Request

`Content-Type: application/json`, body limit 6 MB.

```json
{
  "mode": "analyze",
  "annotations": [
    {
      "sessionMs": 14000,
      "timestampStr": "00:14",
      "text": "Revenue looks wrong for Germany",
      "telemetrySnapshot": { "country": "Germany", "period": "All", "revenueKPI": "$3,920,000", "chartTotal": 760000 }
    }
  ],
  "events": [
    {
      "sessionMs": 12000,
      "type": "filter_changed",
      "detail": "country=Germany; period=All",
      "snapshot": { "country": "Germany", "period": "All", "revenueKPI": "$3,920,000", "chartTotal": 760000 }
    }
  ],
  "deterministicFinding": null,
  "history": [],
  "frames": ["data:image/jpeg;base64,..."]
}
```

| Field | Type | Limits |
| --- | --- | --- |
| `mode` | `"analyze"` or `"next"` | `analyze` returns a summary and first question; `next` decides on a follow-up. |
| `annotations` | array | max 20; `text` max 500 chars; `timestampStr` max 10 |
| `events` | array | max 100; `type` max 40; `detail` max 300 |
| `deterministicFinding` | object or `null` | `{ fromMs, toMs, before, after }`, snapshots as below |
| `history` | array of `{ question, answer }` | max 6; each string max 400 |
| `frames` | array of data URLs | max 3; each `data:image/(jpeg\|png);base64,...`, max 1,500,000 chars |

Snapshot: `country` (max 80), `period` (max 40), `revenueKPI` (max 40), `chartTotal` (finite number).

## Responses

### `mode: "analyze"`, status 200

```json
{
  "summary": "Between 00:12 and 00:14 ...",
  "question": { "id": "kpi_expectation", "prompt": "How should ...?", "options": ["...", "..."] }
}
```

### `mode: "next"`, status 200

```json
{ "done": false, "question": { "id": "scope_of_filtering", "prompt": "...", "options": ["...", "..."] } }
```

or `{ "done": true, "question": null }` when no further question is needed.

Constraints: `summary` 1 to 1500 chars; question `id` 1 to 60, `prompt` 1 to 400, 2 to 4 `options` of 1 to 240 chars each.

Cost guard: when `mode` is `next` and `history` has more than `MAX_FOLLOW_UPS` (3) entries, the server returns `{ "done": true, "question": null }` without calling the model.

## Errors

All errors are `{ "error": "<generic message>" }`. Messages never include the API key, upstream bodies or headers.

| Status | Cause |
| --- | --- |
| 400 | Invalid JSON, or payload failed schema validation |
| 405 | Method other than `POST` |
| 413 | Body larger than 6 MB |
| 502 | Upstream error, empty reply, malformed JSON or schema mismatch from the model |
| 503 | `OPENAI_API_KEY` is not set |
| 504 | The model did not answer within 30 s |

The browser client times out after 35 s. On any failure (network, timeout, non-2xx, schema mismatch) `LlmAIInvestigator` falls back to the mock and sets `source: "mock"`.

## Upstream call

`handleInvestigate` posts to `https://api.openai.com/v1/chat/completions` with `response_format: { type: "json_object" }`, `temperature: 0.2`, `max_tokens: 700`, and the model from `OPENAI_MODEL` (default `gpt-4o-mini`). Frames are sent as `image_url` parts with `detail: "low"`.

## Example

```bash
curl -s -X POST http://localhost:5173/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"mode":"next","annotations":[],"events":[],"deterministicFinding":null,"history":[],"frames":[]}'
```

Without a key this returns `503`. With a key it calls the model.
