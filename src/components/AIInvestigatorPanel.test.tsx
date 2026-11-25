import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AIInvestigatorPanel from '@/components/AIInvestigatorPanel';

import type { Annotation, InvestigationAnalysis, NextQuestionResult, TelemetryEvent } from '@/types';

const analyzeTelemetry = vi.fn();
const getNextQuestion = vi.fn();

vi.mock('@/services/investigatorService', () => ({
  aiInvestigatorService: {
    analyzeTelemetry: (...args: unknown[]) => analyzeTelemetry(...args),
    getNextQuestion: (...args: unknown[]) => getNextQuestion(...args)
  }
}));

const snapshot = { country: 'Germany', period: 'All', revenueKPI: '$3,920,000', chartTotal: 760000 };
const annotations: Annotation[] = [
  { id: 'a1', sessionMs: 8000, timestampStr: '00:08', text: 'KPI looks off', telemetrySnapshot: snapshot }
];
const events: TelemetryEvent[] = [{ id: 'e1', sessionMs: 8000, type: 'filter_changed', snapshot }];

const analysis = (source: 'llm' | 'mock'): InvestigationAnalysis => ({
  summary: 'Observed an inconsistent update.',
  questions: [{ id: 'q1', prompt: 'What should the KPI show?', options: ['Country value', 'Global value'] }],
  source
});

function renderPanel(onFinished = vi.fn()): void {
  render(
    <AIInvestigatorPanel
      annotations={annotations}
      events={events}
      onInvestigationFinished={onFinished}
      onReset={() => undefined}
    />
  );
}

describe('AIInvestigatorPanel', () => {
  beforeEach(() => {
    analyzeTelemetry.mockReset();
    getNextQuestion.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('labels a model answer as the language model', async () => {
    analyzeTelemetry.mockResolvedValue(analysis('llm'));
    renderPanel();
    fireEvent.click(screen.getByTestId('analyze-telemetry-btn'));

    await screen.findByTestId('a2ui-form');
    expect(screen.getByTestId('investigator-source')).toHaveTextContent('Language model');
  });

  it('labels a fallback answer so it is never mistaken for the model', async () => {
    analyzeTelemetry.mockResolvedValue(analysis('mock'));
    renderPanel();
    fireEvent.click(screen.getByTestId('analyze-telemetry-btn'));

    await screen.findByTestId('a2ui-form');
    expect(screen.getByTestId('investigator-source')).toHaveTextContent(/fallback/i);
  });

  it('sends the dialogue history and ignores extra clicks while a follow-up is in flight', async () => {
    analyzeTelemetry.mockResolvedValue(analysis('llm'));
    let resolveNext: (value: NextQuestionResult) => void = () => undefined;
    getNextQuestion.mockReturnValue(new Promise<NextQuestionResult>((resolve) => (resolveNext = resolve)));

    renderPanel();
    fireEvent.click(screen.getByTestId('analyze-telemetry-btn'));
    await screen.findByTestId('a2ui-form');

    fireEvent.click(screen.getByTestId('a2ui-option-0'));
    fireEvent.click(screen.getByTestId('a2ui-option-1'));

    expect(screen.getByTestId('investigator-thinking')).toBeInTheDocument();
    expect(getNextQuestion).toHaveBeenCalledTimes(1);
    expect(getNextQuestion.mock.calls[0][0].history).toEqual([
      { question: 'What should the KPI show?', answer: 'Country value' }
    ]);

    resolveNext({ question: null, source: 'llm' });
    await waitFor(() => expect(screen.getByTestId('compile-issue-btn')).toBeInTheDocument());
  });

  it('shows the next model question and finishes with the collected answers', async () => {
    analyzeTelemetry.mockResolvedValue(analysis('llm'));
    getNextQuestion
      .mockResolvedValueOnce({
        question: { id: 'q2', prompt: 'Scope?', options: ['All KPIs', 'Revenue only'] },
        source: 'llm'
      })
      .mockResolvedValueOnce({ question: null, source: 'llm' });
    const onFinished = vi.fn();

    renderPanel(onFinished);
    fireEvent.click(screen.getByTestId('analyze-telemetry-btn'));
    await screen.findByTestId('a2ui-form');
    fireEvent.click(screen.getByTestId('a2ui-option-0'));

    await screen.findByText('Scope?');
    fireEvent.click(screen.getByTestId('a2ui-option-1'));

    fireEvent.click(await screen.findByTestId('compile-issue-btn'));
    expect(onFinished).toHaveBeenCalledWith({
      summary: 'Observed an inconsistent update.',
      analysisSource: 'llm',
      latestSource: 'llm',
      answers: [
        { question: 'What should the KPI show?', answer: 'Country value' },
        { question: 'Scope?', answer: 'Revenue only' }
      ]
    });
  });

  it('ends the dialogue gracefully if the follow-up call throws', async () => {
    analyzeTelemetry.mockResolvedValue(analysis('llm'));
    getNextQuestion.mockRejectedValue(new Error('boom'));
    renderPanel();
    fireEvent.click(screen.getByTestId('analyze-telemetry-btn'));
    await screen.findByTestId('a2ui-form');

    fireEvent.click(screen.getByTestId('a2ui-option-0'));
    expect(await screen.findByTestId('compile-issue-btn')).toBeInTheDocument();
  });
});
