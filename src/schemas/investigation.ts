import { z } from 'zod';

/**
 * Shared contract between the browser, the local API middleware and the LLM.
 * Kept free of app-specific imports so both Node (server/) and the browser (src/) can use it.
 */

export const MAX_FRAMES = 3;
export const MAX_FRAME_CHARS = 1_500_000;
export const MAX_FOLLOW_UPS = 3;

const FRAME_PATTERN = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export const TelemetrySnapshotSchema = z.object({
  country: z.string().max(80),
  period: z.string().max(40),
  revenueKPI: z.string().max(40),
  chartTotal: z.number().finite()
});

const AnnotationInputSchema = z.object({
  sessionMs: z.number().int().nonnegative(),
  timestampStr: z.string().max(10),
  text: z.string().max(500),
  telemetrySnapshot: TelemetrySnapshotSchema
});

const EventInputSchema = z.object({
  sessionMs: z.number().int().nonnegative(),
  type: z.string().max(40),
  detail: z.string().max(300).optional(),
  snapshot: TelemetrySnapshotSchema
});

const FindingSchema = z.object({
  fromMs: z.number().int().nonnegative(),
  toMs: z.number().int().nonnegative(),
  before: TelemetrySnapshotSchema,
  after: TelemetrySnapshotSchema
});

const AnswerSchema = z.object({
  question: z.string().max(400),
  answer: z.string().max(400)
});

export const InvestigateRequestSchema = z.object({
  mode: z.enum(['analyze', 'next']),
  annotations: z.array(AnnotationInputSchema).max(20),
  events: z.array(EventInputSchema).max(100),
  /** Result of the deterministic check, given to the model as grounding (may be null). */
  deterministicFinding: FindingSchema.nullable(),
  history: z.array(AnswerSchema).max(6),
  frames: z.array(z.string().max(MAX_FRAME_CHARS).regex(FRAME_PATTERN)).max(MAX_FRAMES)
});

export const QuestionSchema = z.object({
  id: z.string().min(1).max(60),
  prompt: z.string().min(1).max(400),
  options: z.array(z.string().min(1).max(240)).min(2).max(4)
});

export const AnalyzeOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  question: QuestionSchema
});

export const NextOutputSchema = z.object({
  done: z.boolean(),
  question: QuestionSchema.nullable()
});

export type InvestigateRequest = z.infer<typeof InvestigateRequestSchema>;
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;
export type NextOutput = z.infer<typeof NextOutputSchema>;
