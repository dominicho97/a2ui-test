import { z } from 'zod';

import { TelemetrySnapshotSchema } from '@/schemas/investigation';

/**
 * Shape of the exported UAT issue report (JSON download and the source for the Markdown copy).
 * Screenshots are not embedded: they are large base64 blobs, so each annotation only records
 * whether a frame was captured. All `*Ms` values are on the shared session clock
 * (0 = first recorded video frame).
 */

export const ISSUE_REPORT_SCHEMA_VERSION = 1;

const AnnotationExportSchema = z.object({
  id: z.string(),
  sessionMs: z.number().int().nonnegative(),
  timestampStr: z.string(),
  text: z.string(),
  hasFrame: z.boolean(),
  telemetrySnapshot: TelemetrySnapshotSchema
});

const EventExportSchema = z.object({
  id: z.string(),
  sessionMs: z.number().int().nonnegative(),
  timestampStr: z.string(),
  type: z.string(),
  detail: z.string().optional(),
  snapshot: TelemetrySnapshotSchema
});

const EvidenceWindowSchema = z.object({
  fromMs: z.number().int().nonnegative(),
  toMs: z.number().int().nonnegative(),
  fromTimestamp: z.string(),
  toTimestamp: z.string(),
  before: TelemetrySnapshotSchema,
  after: TelemetrySnapshotSchema
});

export const IssueReportSchema = z.object({
  schemaVersion: z.literal(ISSUE_REPORT_SCHEMA_VERSION),
  reportedAt: z.string().datetime(),
  issue: z.object({
    title: z.string(),
    category: z.string(),
    severity: z.string(),
    description: z.string(),
    expectedBehavior: z.string(),
    reproductionSteps: z.string()
  }),
  verification: z.object({
    status: z.enum(['Draft', 'Approved']),
    approvedAt: z.string().datetime().nullable()
  }),
  investigation: z.object({
    /** Engine that produced the opening analysis; null when no investigation ran. */
    analysisSource: z.enum(['llm', 'mock']).nullable(),
    /** Engine that produced the latest follow-up (differs when the model failed mid-dialogue). */
    latestSource: z.enum(['llm', 'mock']).nullable(),
    summary: z.string().nullable(),
    clarifications: z.array(z.object({ question: z.string(), answer: z.string() }))
  }),
  session: z.object({
    durationMs: z.number().int().nonnegative(),
    durationTimestamp: z.string(),
    annotationCount: z.number().int().nonnegative(),
    evidenceFrameCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative()
  }),
  /** Observed window where the country changed, the chart moved and the KPI did not; null if none. */
  evidenceWindow: EvidenceWindowSchema.nullable(),
  annotations: z.array(AnnotationExportSchema),
  events: z.array(EventExportSchema)
});

export type IssueReport = z.infer<typeof IssueReportSchema>;
