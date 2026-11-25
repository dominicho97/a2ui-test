import { findStaleKpiEvidence, MockAIInvestigator } from '@/services/AIInvestigatorService';
import type { TelemetryEvent, TelemetryEventType } from '@/types';

function event(
  sessionMs: number,
  type: TelemetryEventType,
  country: string,
  revenueKPI: string,
  chartTotal: number
): TelemetryEvent {
  return {
    id: `${type}-${sessionMs}`,
    sessionMs,
    type,
    snapshot: { country, period: 'All', revenueKPI, chartTotal }
  };
}

describe('findStaleKpiEvidence', () => {
  it('detects a KPI that stays put while the chart responds to a country change', () => {
    const events = [
      event(0, 'recording_started', 'All', '$3,920,000', 3_920_000),
      event(8_000, 'filter_changed', 'Germany', '$3,920,000', 760_000)
    ];
    const evidence = findStaleKpiEvidence(events);
    expect(evidence?.before.sessionMs).toBe(0);
    expect(evidence?.after.snapshot.country).toBe('Germany');
  });

  it('does not flag a KPI that follows the chart', () => {
    const events = [
      event(0, 'recording_started', 'All', '$3,920,000', 3_920_000),
      event(8_000, 'filter_changed', 'Germany', '$760,000', 760_000)
    ];
    expect(findStaleKpiEvidence(events)).toBeNull();
  });

  it('does not need a reference ledger: only observed values are compared', () => {
    // chartTotal is the only "other" value; it is read from the screen, not from hidden truth.
    const events = [event(0, 'recording_started', 'All', '$10', 10), event(1, 'filter_changed', 'Japan', '$10', 4)];
    expect(findStaleKpiEvidence(events)).not.toBeNull();
  });

  it('orders events by session time before comparing', () => {
    const events = [
      event(8_000, 'filter_changed', 'Germany', '$3,920,000', 760_000),
      event(0, 'recording_started', 'All', '$3,920,000', 3_920_000)
    ];
    expect(findStaleKpiEvidence(events)?.after.sessionMs).toBe(8_000);
  });

  it('ignores period-only changes', () => {
    const base = event(0, 'recording_started', 'All', '$3,920,000', 3_920_000);
    const periodChange: TelemetryEvent = {
      ...event(5_000, 'filter_changed', 'All', '$3,920,000', 1_000_000),
      snapshot: { country: 'All', period: 'Q1', revenueKPI: '$3,920,000', chartTotal: 1_000_000 }
    };
    expect(findStaleKpiEvidence([base, periodChange])).toBeNull();
  });
});

describe('MockAIInvestigator.analyzeTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds the KPI question from observed events', async () => {
    const service = new MockAIInvestigator();
    const pending = service.analyzeTelemetry(
      [],
      [
        event(0, 'recording_started', 'All', '$3,920,000', 3_920_000),
        event(8_000, 'filter_changed', 'Germany', '$3,920,000', 760_000)
      ]
    );
    await vi.advanceTimersByTimeAsync(2000);
    const analysis = await pending;

    expect(analysis.questions[0].id).toBe('kpi_expectation');
    expect(analysis.summary).toContain('00:00');
    expect(analysis.summary).toContain('00:08');
    expect(analysis.summary).toContain('$760,000');
  });

  it('falls back to a generic question when no inconsistency was observed', async () => {
    const service = new MockAIInvestigator();
    const pending = service.analyzeTelemetry([], [event(0, 'recording_started', 'All', '$1', 1)]);
    await vi.advanceTimersByTimeAsync(2000);
    const analysis = await pending;
    expect(analysis.questions[0].id).toBe('general_issue_type');
  });
});
