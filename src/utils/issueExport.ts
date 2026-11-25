import { IssueReportSchema, ISSUE_REPORT_SCHEMA_VERSION } from '@/schemas/issueReport';
import { findStaleKpiEvidence } from '@/services/AIInvestigatorService';
import { formatCurrency } from '@/utils/format';
import { formatSessionTime } from '@/utils/sessionClock';

import type { IssueReport } from '@/schemas/issueReport';
import type { Annotation, InvestigationRecord, TelemetryEvent } from '@/types';

export interface IssueFields {
  title: string;
  category: string;
  severity: string;
  description: string;
  expectedBehavior: string;
  reproductionSteps: string;
}

export interface BuildIssueReportInput {
  fields: IssueFields;
  status: 'Draft' | 'Approved';
  /** ISO timestamp of the approval; ignored unless `status` is `Approved`. */
  approvedAt: string | null;
  investigation: InvestigationRecord;
  annotations: Annotation[];
  events: TelemetryEvent[];
  /** Injected so tests are deterministic. */
  now: Date;
}

/**
 * Assembles the full export from the reviewed fields plus everything observed in the session,
 * then validates it so a malformed report can never be downloaded or copied.
 */
export function buildIssueReport(input: BuildIssueReportInput): IssueReport {
  const { fields, status, investigation, annotations, events, now } = input;

  const evidence = findStaleKpiEvidence(events);
  const durationMs = Math.max(0, ...events.map((e) => e.sessionMs), ...annotations.map((a) => a.sessionMs));

  const report: IssueReport = {
    schemaVersion: ISSUE_REPORT_SCHEMA_VERSION,
    reportedAt: now.toISOString(),
    issue: { ...fields },
    verification: {
      status,
      approvedAt: status === 'Approved' ? input.approvedAt : null
    },
    investigation: {
      analysisSource: investigation.analysisSource,
      latestSource: investigation.latestSource,
      summary: investigation.summary,
      clarifications: investigation.answers.map(({ question, answer }) => ({ question, answer }))
    },
    session: {
      durationMs,
      durationTimestamp: formatSessionTime(durationMs),
      annotationCount: annotations.length,
      evidenceFrameCount: annotations.filter((a) => Boolean(a.capturedFrameUrl)).length,
      eventCount: events.length
    },
    evidenceWindow: evidence
      ? {
          fromMs: evidence.before.sessionMs,
          toMs: evidence.after.sessionMs,
          fromTimestamp: formatSessionTime(evidence.before.sessionMs),
          toTimestamp: formatSessionTime(evidence.after.sessionMs),
          before: { ...evidence.before.snapshot },
          after: { ...evidence.after.snapshot }
        }
      : null,
    annotations: annotations.map((a) => ({
      id: a.id,
      sessionMs: a.sessionMs,
      timestampStr: a.timestampStr,
      text: a.text,
      hasFrame: Boolean(a.capturedFrameUrl),
      telemetrySnapshot: { ...a.telemetrySnapshot }
    })),
    events: [...events]
      .sort((a, b) => a.sessionMs - b.sessionMs)
      .map((e) => ({
        id: e.id,
        sessionMs: e.sessionMs,
        timestampStr: formatSessionTime(e.sessionMs),
        type: e.type,
        detail: e.detail,
        snapshot: { ...e.snapshot }
      }))
  };

  return IssueReportSchema.parse(report);
}

function sourceLabel(source: IssueReport['investigation']['analysisSource']): string {
  if (source === 'llm') return 'Language model';
  if (source === 'mock') return 'Offline fallback (rule-based)';
  return 'Not run';
}

/** Renders the same report object as Markdown so the two exports can never disagree. */
export function renderIssueMarkdown(report: IssueReport): string {
  const { issue, verification, investigation, session, evidenceWindow } = report;

  const lines: string[] = [
    `# ${issue.title}`,
    '',
    '## Issue Metadata',
    `- **Category**: ${issue.category}`,
    `- **Severity**: ${issue.severity}`,
    `- **Verification Status**: ${verification.status}${
      verification.approvedAt ? ` (approved ${verification.approvedAt})` : ''
    }`,
    `- **Reported At**: ${report.reportedAt}`,
    `- **Session Length**: ${session.durationTimestamp} (${session.annotationCount} notes, ${session.evidenceFrameCount} frames, ${session.eventCount} events)`,
    '',
    '## Description',
    issue.description,
    '',
    '## Expected Behavior',
    issue.expectedBehavior,
    '',
    '## Proposed Replication Steps',
    issue.reproductionSteps,
    ''
  ];

  lines.push('## Observed Evidence Window');
  if (evidenceWindow) {
    const { before, after } = evidenceWindow;
    lines.push(
      `Between ${evidenceWindow.fromTimestamp} and ${evidenceWindow.toTimestamp} the country changed from "${before.country}" to "${after.country}".`,
      `- Chart total: ${formatCurrency(before.chartTotal)} -> ${formatCurrency(after.chartTotal)}`,
      `- Revenue KPI: ${before.revenueKPI} -> ${after.revenueKPI}`
    );
  } else {
    lines.push('No inconsistent update was detected automatically in the recorded events.');
  }
  lines.push('');

  lines.push('## Tester Notes');
  if (report.annotations.length === 0) {
    lines.push('_None._');
  } else {
    report.annotations.forEach((a) => {
      lines.push(
        `- **${a.timestampStr}** (${a.sessionMs} ms)${a.hasFrame ? ' [frame captured]' : ''}: ${a.text}`,
        `  - Country "${a.telemetrySnapshot.country}", period "${a.telemetrySnapshot.period}", KPI ${a.telemetrySnapshot.revenueKPI}, chart total ${formatCurrency(a.telemetrySnapshot.chartTotal)}`
      );
    });
  }
  lines.push('');

  lines.push(
    '## AI Investigator',
    `- **Analysis engine**: ${sourceLabel(investigation.analysisSource)}`,
    `- **Latest follow-up engine**: ${sourceLabel(investigation.latestSource)}`
  );
  if (investigation.summary) {
    lines.push('', '### Summary', investigation.summary);
  }
  lines.push('', '### Clarifications');
  if (investigation.clarifications.length === 0) {
    lines.push('_None._');
  } else {
    investigation.clarifications.forEach((c, i) => {
      lines.push(`${i + 1}. **Q**: ${c.question}`, `   **A**: _${c.answer}_`);
    });
  }
  lines.push('');

  lines.push('## Telemetry Event Log');
  if (report.events.length === 0) {
    lines.push('_None._');
  } else {
    lines.push('| Time | Event | Detail | Country | Period | KPI | Chart total |', '| --- | --- | --- | --- | --- | --- | --- |');
    report.events.forEach((e) => {
      lines.push(
        `| ${e.timestampStr} (${e.sessionMs} ms) | ${e.type} | ${(e.detail ?? '').replace(/\|/g, '\\|')} | ${e.snapshot.country} | ${e.snapshot.period} | ${e.snapshot.revenueKPI} | ${formatCurrency(e.snapshot.chartTotal)} |`
      );
    });
  }
  lines.push('', '*Reported via FeedbackFlow AI - Automated UAT Assistant*');

  return lines.join('\n');
}
