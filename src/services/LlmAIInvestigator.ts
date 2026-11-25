import {
  AnalyzeOutputSchema,
  NextOutputSchema,
  type InvestigateRequest
} from '@/schemas/investigation';
import { findStaleKpiEvidence } from '@/services/AIInvestigatorService';
import { downscaleFrame, selectEvidenceFrames } from '@/utils/frames';

import type {
  AIInvestigatorService,
  Annotation,
  InvestigationAnalysis,
  NextQuestionContext,
  NextQuestionResult,
  TelemetryEvent
} from '@/types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API_ROUTE = '/api/investigate';
const CLIENT_TIMEOUT_MS = 35_000;

function toRequestBase(
  annotations: Annotation[],
  events: TelemetryEvent[]
): Pick<InvestigateRequest, 'annotations' | 'events' | 'deterministicFinding'> {
  const finding = findStaleKpiEvidence(events);
  return {
    annotations: annotations.map((a) => ({
      sessionMs: a.sessionMs,
      timestampStr: a.timestampStr,
      text: a.text.slice(0, 500),
      telemetrySnapshot: a.telemetrySnapshot
    })),
    events: events.map((e) => ({
      sessionMs: e.sessionMs,
      type: e.type,
      detail: e.detail?.slice(0, 300),
      snapshot: e.snapshot
    })),
    deterministicFinding: finding
      ? {
          fromMs: finding.before.sessionMs,
          toMs: finding.after.sessionMs,
          before: finding.before.snapshot,
          after: finding.after.snapshot
        }
      : null
  };
}

/**
 * Calls the local /api/investigate proxy (which holds the API key) and validates the reply.
 * Any failure (network, timeout, HTTP error, schema mismatch) falls back to `fallback`, and the
 * result's `source` says which engine answered so the UI never presents a fallback as the model.
 */
export class LlmAIInvestigator implements AIInvestigatorService {
  constructor(
    private readonly fallback: AIInvestigatorService,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  async analyzeTelemetry(annotations: Annotation[], events: TelemetryEvent[]): Promise<InvestigationAnalysis> {
    try {
      const frames = await this.prepareFrames(annotations);
      const body = await this.post({
        mode: 'analyze',
        ...toRequestBase(annotations, events),
        history: [],
        frames
      });
      const output = AnalyzeOutputSchema.parse(body);
      return { summary: output.summary, questions: [output.question], source: 'llm' };
    } catch (e) {
      console.error('LLM analysis unavailable, using the built-in investigator:', e);
      return this.fallback.analyzeTelemetry(annotations, events);
    }
  }

  async getNextQuestion(context: NextQuestionContext): Promise<NextQuestionResult> {
    try {
      const body = await this.post({
        mode: 'next',
        ...toRequestBase(context.annotations, context.events),
        history: context.history,
        frames: []
      });
      const output = NextOutputSchema.parse(body);
      return { question: output.done ? null : output.question, source: 'llm' };
    } catch (e) {
      console.error('LLM follow-up unavailable, using the built-in investigator:', e);
      return this.fallback.getNextQuestion(context);
    }
  }

  private async prepareFrames(annotations: Annotation[]): Promise<string[]> {
    const selected = selectEvidenceFrames(annotations);
    const scaled = await Promise.all(selected.map((frame) => downscaleFrame(frame)));
    return scaled.filter((frame): frame is string => frame !== null);
  }

  private async post(payload: InvestigateRequest): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(API_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`investigate API responded with ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
