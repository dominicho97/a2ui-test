import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import IssueDraft from '@/components/IssueDraft';
import { IssueReportSchema } from '@/schemas/issueReport';

import type { Annotation, InvestigationRecord, TelemetryEvent, TelemetrySnapshot } from '@/types';

const all: TelemetrySnapshot = { country: 'All', period: 'All', revenueKPI: '$3,200,000', chartTotal: 3200000 };
const germany: TelemetrySnapshot = { country: 'Germany', period: 'All', revenueKPI: '$3,200,000', chartTotal: 760000 };

const events: TelemetryEvent[] = [
  { id: 'e1', sessionMs: 0, type: 'recording_started', snapshot: all },
  { id: 'e2', sessionMs: 9000, type: 'filter_changed', detail: 'country=Germany; period=All', snapshot: germany }
];
const annotations: Annotation[] = [
  { id: 'a1', sessionMs: 9500, timestampStr: '00:09', text: 'KPI looks off', telemetrySnapshot: germany }
];
const investigation: InvestigationRecord = {
  summary: 'Chart moved, KPI did not.',
  analysisSource: 'llm',
  latestSource: 'llm',
  answers: [{ question: 'What should the KPI show?', answer: 'Country value' }]
};

/** jsdom's Blob has no .text(), so read it through FileReader. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error);
    reader.readAsText(blob);
  });
}

function renderDraft(onReset = vi.fn()): void {
  render(<IssueDraft annotations={annotations} events={events} investigation={investigation} onReset={onReset} />);
}

describe('IssueDraft', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let lastBlob: Blob | null;

  beforeEach(() => {
    lastBlob = null;
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    createObjectURL = vi.fn((blob: Blob) => {
      lastBlob = blob;
      return 'blob:report';
    });
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefills the draft from the observed evidence, not a hard-coded value', () => {
    renderDraft();
    expect(screen.getByDisplayValue(/Country Filter applied to "Germany"/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/chart and table total \$760,000 while the KPI displays \$3,200,000/)).toBeInTheDocument();
  });

  it('copies Markdown containing the full investigation context', async () => {
    renderDraft();
    fireEvent.click(screen.getByTestId('copy-markdown-btn'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const md = writeText.mock.calls[0][0] as string;
    expect(md).toContain('**Verification Status**: Draft');
    expect(md).toContain('Between 00:00 and 00:09');
    expect(md).toContain('**00:09** (9500 ms): KPI looks off');
    expect(md).toContain('Q**: What should the KPI show?');
    expect(md).toContain('filter_changed');
    expect(md).toContain('Language model');
    await screen.findByText('Copied Markdown!');
  });

  it('downloads schema-valid JSON and releases the Blob URL', async () => {
    renderDraft();
    fireEvent.click(screen.getByTestId('download-json-btn'));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');

    const report = IssueReportSchema.parse(JSON.parse(await readBlob(lastBlob as Blob)));
    expect(report.events).toHaveLength(2);
    expect(report.annotations[0]).toMatchObject({ sessionMs: 9500, timestampStr: '00:09' });
    expect(report.investigation.clarifications).toHaveLength(1);
    expect(report.evidenceWindow?.after.country).toBe('Germany');
    expect(report.verification).toEqual({ status: 'Draft', approvedAt: null });
  });

  it('stamps the approval time into the export and clears it when revoked', async () => {
    renderDraft();
    fireEvent.click(screen.getByTestId('approve-issue-btn'));
    fireEvent.click(screen.getByTestId('download-json-btn'));

    const approved = IssueReportSchema.parse(JSON.parse(await readBlob(lastBlob as Blob)));
    expect(approved.verification.status).toBe('Approved');
    expect(approved.verification.approvedAt).not.toBeNull();

    fireEvent.click(screen.getByTestId('revoke-approval-btn'));
    fireEvent.click(screen.getByTestId('download-json-btn'));
    const revoked = IssueReportSchema.parse(JSON.parse(await readBlob(lastBlob as Blob)));
    expect(revoked.verification).toEqual({ status: 'Draft', approvedAt: null });
  });

  it('includes reviewer edits in the export', async () => {
    renderDraft();
    fireEvent.change(screen.getByDisplayValue(/Country Filter applied to "Germany"/), {
      target: { value: 'Edited title' }
    });
    fireEvent.click(screen.getByTestId('download-json-btn'));

    const report = IssueReportSchema.parse(JSON.parse(await readBlob(lastBlob as Blob)));
    expect(report.issue.title).toBe('Edited title');
  });

  it('logs and survives a clipboard failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    writeText.mockRejectedValue(new Error('denied'));
    renderDraft();
    fireEvent.click(screen.getByTestId('copy-markdown-btn'));

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.queryByText('Copied Markdown!')).not.toBeInTheDocument();
  });
});
