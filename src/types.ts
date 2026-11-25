/**
 * Values read from what the dashboard is actually rendering at a point in time.
 * No hidden ground truth / reference ledger is part of this contract, so the same shape can be
 * collected from a real enterprise report (e.g. Power BI) by scraping visible values.
 */
export interface TelemetrySnapshot {
  country: string;
  period: string;
  /** Revenue KPI card text as displayed. */
  revenueKPI: string;
  /** Sum of the values plotted in the revenue chart as displayed. */
  chartTotal: number;
}

export interface Annotation {
  id: string;
  /** Milliseconds on the shared session clock (0 = first recorded video frame). */
  sessionMs: number;
  /** Formatted session time, e.g. "00:14". */
  timestampStr: string;
  text: string;
  /** Base64 data URL captured from the live video. */
  capturedFrameUrl?: string;
  telemetrySnapshot: TelemetrySnapshot;
}

export interface NewAnnotationInput {
  text: string;
  /** Stamped from the shared session clock at the moment the tester submitted the note. */
  sessionMs: number;
  capturedFrameUrl?: string;
}

export type RecordingStatus = 'idle' | 'recording' | 'stopped';

export type StopReason = 'user' | 'sharing_ended' | 'recorder_error';

export type TelemetryEventType =
  | 'recording_started'
  | 'filter_changed'
  | 'annotation_added'
  | 'recording_paused'
  | 'recording_resumed'
  | 'capture_interrupted'
  | 'capture_resumed'
  | 'recording_stopped';

/** Internal event log entry. Timestamps share the clock used for annotations and the video. */
export interface TelemetryEvent {
  id: string;
  sessionMs: number;
  type: TelemetryEventType;
  detail?: string;
  snapshot: TelemetrySnapshot;
}

export interface InvestigationQuestion {
  id: string;
  prompt: string;
  options: string[];
}

/** Which engine produced a result, shown in the UI so a fallback is never mistaken for the model. */
export type AnalysisSource = 'llm' | 'mock';

export interface InvestigationAnalysis {
  summary: string;
  questions: InvestigationQuestion[];
  source: AnalysisSource;
}

export interface InvestigationAnswer {
  question: string;
  answer: string;
}

export interface NextQuestionResult {
  /** `null` means the dialogue is finished. */
  question: InvestigationQuestion | null;
  source: AnalysisSource;
}

export interface NextQuestionContext {
  questionId: string;
  selectedOptionIndex: number;
  country: string;
  history: InvestigationAnswer[];
  annotations: Annotation[];
  events: TelemetryEvent[];
}

export interface AIInvestigatorService {
  analyzeTelemetry(annotations: Annotation[], events: TelemetryEvent[]): Promise<InvestigationAnalysis>;
  getNextQuestion(context: NextQuestionContext): Promise<NextQuestionResult>;
}

/** What the investigator produced, handed from the investigation tab to the review tab. */
export interface InvestigationRecord {
  summary: string | null;
  /** Engine behind the opening analysis. */
  analysisSource: AnalysisSource | null;
  /** Engine behind the last follow-up question (can differ if the model failed mid-dialogue). */
  latestSource: AnalysisSource | null;
  answers: InvestigationAnswer[];
}

