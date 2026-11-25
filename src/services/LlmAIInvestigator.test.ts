import { LlmAIInvestigator } from '@/services/LlmAIInvestigator';
import { MockAIInvestigator } from '@/services/AIInvestigatorService';

import type { Annotation, NextQuestionContext, TelemetryEvent, TelemetrySnapshot } from '@/types';

const allSnapshot: TelemetrySnapshot = { country: 'All', period: 'All', revenueKPI: '$3,920,000', chartTotal: 3_920_000 };
const deSnapshot: TelemetrySnapshot = { country: 'Germany', period: 'All', revenueKPI: '$3,920,000', chartTotal: 760_000 };

const events: TelemetryEvent[] = [
  { id: 'e1', sessionMs: 0, type: 'recording_started', snapshot: allSnapshot },
  { id: 'e2', sessionMs: 8000, type: 'filter_changed', detail: 'country=Germany', snapshot: deSnapshot }
];

const annotations: Annotation[] = [
  { id: 'a1', sessionMs: 8000, timestampStr: '00:08', text: 'KPI looks off', telemetrySnapshot: deSnapshot }
];

const analyzeReply = {
  summary: 'Chart moved, KPI did not.',
  question: { id: 'q1', prompt: 'What should the KPI show?', options: ['Country value', 'Global value'] }
};

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

const context = (): NextQuestionContext => ({
  questionId: 'kpi_expectation',
  selectedOptionIndex: 0,
  country: 'Germany',
  history: [{ question: 'q', answer: 'a' }],
  annotations,
  events
});

describe('LlmAIInvestigator', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the model analysis tagged as llm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(analyzeReply));
    const service = new LlmAIInvestigator(new MockAIInvestigator(), fetchMock);

    const result = await service.analyzeTelemetry(annotations, events);

    expect(result.source).toBe('llm');
    expect(result.questions[0].id).toBe('q1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/investigate');
    const sent = JSON.parse(String(init.body));
    expect(sent.mode).toBe('analyze');
    expect(sent.deterministicFinding.after.country).toBe('Germany');
  });

  it('never puts an API key or auth header in the browser request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(analyzeReply));
    await new LlmAIInvestigator(new MockAIInvestigator(), fetchMock).analyzeTelemetry(annotations, events);

    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization|bearer|sk-/i);
    expect(String(init.body)).not.toMatch(/sk-/);
  });

  it('falls back to the built-in investigator on an HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'nope' }, 502));
    const service = new LlmAIInvestigator(new MockAIInvestigator(), fetchMock);

    const pending = service.analyzeTelemetry(annotations, events);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result.source).toBe('mock');
    expect(result.questions[0].id).toBe('kpi_expectation');
  });

  it('falls back when the model reply does not match the schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ summary: 'x' }));
    const service = new LlmAIInvestigator(new MockAIInvestigator(), fetchMock);

    const pending = service.analyzeTelemetry(annotations, events);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).source).toBe('mock');
  });

  it('falls back when the network request rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    const service = new LlmAIInvestigator(new MockAIInvestigator(), fetchMock);

    const pending = service.analyzeTelemetry(annotations, events);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).source).toBe('mock');
  });

  it('aborts and falls back when the proxy hangs', async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        })
    );
    const service = new LlmAIInvestigator(new MockAIInvestigator(), fetchMock);

    const pending = service.analyzeTelemetry(annotations, events);
    await vi.advanceTimersByTimeAsync(40_000);
    expect((await pending).source).toBe('mock');
  });

  it('returns the next model question, or null when the model says it is done', async () => {
    const next = { done: false, question: { id: 'q2', prompt: 'Scope?', options: ['A', 'B'] } };
    const service = new LlmAIInvestigator(
      new MockAIInvestigator(),
      vi.fn().mockResolvedValueOnce(json(next)).mockResolvedValueOnce(json({ done: true, question: null }))
    );

    const first = await service.getNextQuestion(context());
    expect(first.source).toBe('llm');
    expect(first.question?.id).toBe('q2');

    const second = await service.getNextQuestion(context());
    expect(second).toEqual({ question: null, source: 'llm' });
  });

  it('sends the dialogue history with follow-up requests and no frames', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ done: true, question: null }));
    await new LlmAIInvestigator(new MockAIInvestigator(), fetchMock).getNextQuestion(context());

    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.mode).toBe('next');
    expect(sent.history).toHaveLength(1);
    expect(sent.frames).toEqual([]);
  });

  it('falls back to the scripted follow-up when the model is unavailable', async () => {
    const service = new LlmAIInvestigator(new MockAIInvestigator(), vi.fn().mockRejectedValue(new Error('down')));
    const result = await service.getNextQuestion(context());
    expect(result.source).toBe('mock');
    expect(result.question?.id).toBe('scope_of_filtering');
  });
});
