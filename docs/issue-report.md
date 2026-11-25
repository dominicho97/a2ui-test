# Issue report format

The review tab ([`src/components/IssueDraft.tsx`](../src/components/IssueDraft.tsx)) builds one `IssueReport` object with `buildIssueReport` in [`src/utils/issueExport.ts`](../src/utils/issueExport.ts). The object is validated against `IssueReportSchema` ([`src/schemas/issueReport.ts`](../src/schemas/issueReport.ts)) before use, so a malformed report cannot be copied or downloaded. Both exports come from this one object:

- **Copy Markdown**: `renderIssueMarkdown(report)`.
- **Download JSON**: the report serialised as-is.

All `*Ms` values are on the shared session clock (`0` = first recorded video frame). Screenshots are **not** embedded, because they are large base64 blobs. Each annotation only records `hasFrame`.

## JSON structure (`schemaVersion: 1`)

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | Literal. Bump `ISSUE_REPORT_SCHEMA_VERSION` on breaking changes. |
| `reportedAt` | ISO datetime | Time the export was built. |
| `issue.title` | string | Editable in the review tab. |
| `issue.category` | string | Editable. |
| `issue.severity` | string | Editable. |
| `issue.description` | string | Editable. |
| `issue.expectedBehavior` | string | Editable. |
| `issue.reproductionSteps` | string | Editable. |
| `verification.status` | `"Draft"` or `"Approved"` | |
| `verification.approvedAt` | ISO datetime or `null` | `null` unless approved. |
| `investigation.analysisSource` | `"llm"`, `"mock"` or `null` | Engine behind the opening analysis. `null` if no investigation ran. |
| `investigation.latestSource` | `"llm"`, `"mock"` or `null` | Engine behind the last follow-up. It can differ if the model failed mid-dialogue. |
| `investigation.summary` | string or `null` | |
| `investigation.clarifications` | `{ question, answer }[]` | Answers from the adaptive questionnaire. |
| `session.durationMs` | integer | Latest `sessionMs` across events and annotations. |
| `session.durationTimestamp` | string | `mm:ss`. |
| `session.annotationCount` | integer | |
| `session.evidenceFrameCount` | integer | Annotations that captured a frame. |
| `session.eventCount` | integer | |
| `evidenceWindow` | object or `null` | Present when a country change moved the chart total but not the Revenue KPI. |
| `annotations[]` | object | `id`, `sessionMs`, `timestampStr`, `text`, `hasFrame`, `telemetrySnapshot` |
| `events[]` | object | `id`, `sessionMs`, `timestampStr`, `type`, optional `detail`, `snapshot`. Sorted by `sessionMs`. |

`evidenceWindow` has `fromMs`, `toMs`, `fromTimestamp`, `toTimestamp`, `before` and `after` (both telemetry snapshots).

A telemetry snapshot is `{ country, period, revenueKPI, chartTotal }`. `revenueKPI` is the text shown on the card and `chartTotal` is the sum of the plotted revenue values.

### Abbreviated example

```json
{
  "schemaVersion": 1,
  "reportedAt": "2025-01-15T10:30:00.000Z",
  "issue": {
    "title": "Revenue KPI does not respond to Country filter",
    "category": "Data aggregation / calculation error",
    "severity": "Major",
    "description": "...",
    "expectedBehavior": "...",
    "reproductionSteps": "..."
  },
  "verification": { "status": "Approved", "approvedAt": "2025-01-15T10:31:00.000Z" },
  "investigation": {
    "analysisSource": "llm",
    "latestSource": "llm",
    "summary": "...",
    "clarifications": [{ "question": "...", "answer": "..." }]
  },
  "session": {
    "durationMs": 42000,
    "durationTimestamp": "00:42",
    "annotationCount": 1,
    "evidenceFrameCount": 1,
    "eventCount": 4
  },
  "evidenceWindow": {
    "fromMs": 12000,
    "toMs": 15000,
    "fromTimestamp": "00:12",
    "toTimestamp": "00:15",
    "before": { "country": "All", "period": "All", "revenueKPI": "$3,920,000", "chartTotal": 3920000 },
    "after": { "country": "Germany", "period": "All", "revenueKPI": "$3,920,000", "chartTotal": 760000 }
  },
  "annotations": [],
  "events": []
}
```

## Markdown sections

The Markdown export contains, in order: title, Issue Metadata, Description, Expected Behavior, Proposed Replication Steps, Observed Evidence Window, Tester Notes, AI Investigator (engines, summary, clarifications) and a Telemetry Event Log table.

The investigator engine is labelled "Language model", "Offline fallback (rule-based)" or "Not run". This lets a reader tell whether the model or the fallback produced the analysis.
