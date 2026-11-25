import { IssueReportSchema } from '@/schemas/issueReport';
import { buildIssueReport, renderIssueMarkdown, type BuildIssueReportInput } from '@/utils/issueExport';

import type { Annotation, TelemetryEvent, TelemetrySnapshot } from '@/types';

const all: TelemetrySnapshot = { country: 'All', period: 'All', revenueKPI: '$3,200,000', chartTotal: 3200000 };
const germany: TelemetrySnapshot = { country: 'Germany', period: 'All', revenueKPI: '$3,200,000', chartTotal: 760000 };

const events: TelemetryEvent[] = [
  { id: 'e2', sessionMs: 9000, type: 'filter_changed', detail: 'country=Germany; period=All', snapshot: germany },
  { id: 'e1', sessionMs: 0, type: 'recording_started', snapshot: all },
  { id: 'e3', sessionMs: 20500, type: 'recording_stopped', snapshot: germany }
];

const annotations: Annotation[] = [
  {
    id: 'a1',
    sessionMs: 9500,
    timestampStr: '00:09',
    text: 'KPI | looks off',
    capturedFrameUrl: 'data:image/jpeg;base64,AAAA',
    telemetrySnapshot: germany
  },
  { id: 'a2', sessionMs: 12000, timestampStr: '00:12', text: 'Second note', telemetrySnapshot: germany }
];

function makeInput(overrides: Partial<BuildIssueReportInput> = {}): BuildIssueReportInput {
  return {
    fields: {
      title: 'KPI stale',
      category: 'State Sync Failure',
      severity: 'Major',
      description: 'desc',
      expectedBehavior: 'expected',
      reproductionSteps: '1. a\n2. b'
    },
    status: 'Draft',
    approvedAt: null,
    investigation: {
      summary: 'Chart moved, KPI did not.',
      analysisSource: 'llm',
      latestSource: 'mock',
      answers: [{ question: 'What should the KPI show?', answer: 'Country value' }]
    },
    annotations,
    events,
    now: new Date('2025-01-02T03:04:05.000Z'),
    ...overrides
  };
}

describe('buildIssueReport', () => {
  it('includes session timestamps, events, clarifications and investigator metadata', () => {
    const report = buildIssueReport(makeInput());

    expect(IssueReportSchema.safeParse(report).success).toBe(true);
    expect(report.reportedAt).toBe('2025-01-02T03:04:05.000Z');
    expect(report.session).toEqual({
      durationMs: 20500,
      durationTimestamp: '00:20',
      annotationCount: 2,
      evidenceFrameCount: 1,
      eventCount: 3
    });
    expect(report.investigation).toEqual({
      analysisSource: 'llm',
      latestSource: 'mock',
      summary: 'Chart moved, KPI did not.',
      clarifications: [{ question: 'What should the KPI show?', answer: 'Country value' }]
    });
    expect(report.annotations.map((a) => [a.sessionMs, a.timestampStr, a.hasFrame])).toEqual([
      [9500, '00:09', true],
      [12000, '00:12', false]
    ]);
  });

  it('orders events on the session clock and never embeds screenshot data', () => {
    const report = buildIssueReport(makeInput());

    expect(report.events.map((e) => e.sessionMs)).toEqual([0, 9000, 20500]);
    expect(report.events[1].timestampStr).toBe('00:09');
    expect(JSON.stringify(report)).not.toContain('base64');
  });

  it('records the observed stale-KPI window', () => {
    const report = buildIssueReport(makeInput());

    expect(report.evidenceWindow).toMatchObject({
      fromMs: 0,
      toMs: 9000,
      fromTimestamp: '00:00',
      toTimestamp: '00:09',
      before: { country: 'All', revenueKPI: '$3,200,000', chartTotal: 3200000 },
      after: { country: 'Germany', revenueKPI: '$3,200,000', chartTotal: 760000 }
    });
  });

  it('reports no evidence window when the KPI followed the filter', () => {
    const updated: TelemetryEvent[] = [
      events[1],
      { ...events[0], snapshot: { ...germany, revenueKPI: '$760,000' } }
    ];
    expect(buildIssueReport(makeInput({ events: updated })).evidenceWindow).toBeNull();
  });

  it('carries the approval timestamp only while approved', () => {
    const approved = buildIssueReport(makeInput({ status: 'Approved', approvedAt: '2025-01-02T03:00:00.000Z' }));
    expect(approved.verification).toEqual({ status: 'Approved', approvedAt: '2025-01-02T03:00:00.000Z' });

    const revoked = buildIssueReport(makeInput({ status: 'Draft', approvedAt: '2025-01-02T03:00:00.000Z' }));
    expect(revoked.verification).toEqual({ status: 'Draft', approvedAt: null });
  });

  it('exports a valid report when no investigation ran and nothing was recorded', () => {
    const report = buildIssueReport(
      makeInput({
        annotations: [],
        events: [],
        investigation: { summary: null, analysisSource: null, latestSource: null, answers: [] }
      })
    );

    expect(report.session.durationMs).toBe(0);
    expect(report.evidenceWindow).toBeNull();
    expect(report.investigation.analysisSource).toBeNull();
  });
});

describe('renderIssueMarkdown', () => {
  it('renders every section from the same report object', () => {
    const md = renderIssueMarkdown(
      buildIssueReport(makeInput({ status: 'Approved', approvedAt: '2025-01-02T03:00:00.000Z' }))
    );

    expect(md).toContain('# KPI stale');
    expect(md).toContain('**Verification Status**: Approved (approved 2025-01-02T03:00:00.000Z)');
    expect(md).toContain('**Session Length**: 00:20 (2 notes, 1 frames, 3 events)');
    expect(md).toContain('Between 00:00 and 00:09 the country changed from "All" to "Germany".');
    expect(md).toContain('Revenue KPI: $3,200,000 -> $3,200,000');
    expect(md).toContain('**00:09** (9500 ms) [frame captured]: KPI | looks off');
    expect(md).toContain('**Analysis engine**: Language model');
    expect(md).toContain('**Latest follow-up engine**: Offline fallback (rule-based)');
    expect(md).toContain('### Summary\nChart moved, KPI did not.');
    expect(md).toContain('1. **Q**: What should the KPI show?');
    expect(md).toContain('| 00:09 (9000 ms) | filter_changed | country=Germany; period=All | Germany |');
    expect(md).not.toContain('base64');
  });

  it('states plainly when nothing was detected or run', () => {
    const md = renderIssueMarkdown(
      buildIssueReport(
        makeInput({
          annotations: [],
          events: [],
          investigation: { summary: null, analysisSource: null, latestSource: null, answers: [] }
        })
      )
    );

    expect(md).toContain('No inconsistent update was detected automatically');
    expect(md).toContain('**Analysis engine**: Not run');
    expect(md).toContain('_None._');
  });
});
