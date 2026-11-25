import { useState, type ReactElement } from 'react';
import { Download, Copy, CheckCircle, FileText, Check } from 'lucide-react';

import { findStaleKpiEvidence } from '@/services/AIInvestigatorService';
import { formatCurrency } from '@/utils/format';
import { buildIssueReport, renderIssueMarkdown } from '@/utils/issueExport';

import type { Annotation, InvestigationRecord, TelemetryEvent } from '@/types';

interface IssueDraftProps {
  annotations: Annotation[];
  events: TelemetryEvent[];
  investigation: InvestigationRecord;
  onReset: () => void;
}

export default function IssueDraft({
  annotations,
  events,
  investigation,
  onReset
}: IssueDraftProps): ReactElement {
  const a2uiAnswers = investigation.answers;

  // Prefer the observed inconsistent update; otherwise the first filtered note, then any note.
  const bugAnnotation = annotations.find(
    (anno) => anno.telemetrySnapshot.country !== 'All'
  ) || annotations[0];
  const evidenceSnapshot = findStaleKpiEvidence(events)?.after.snapshot ?? bugAnnotation?.telemetrySnapshot;

  const country = evidenceSnapshot?.country ?? 'a specific country';
  const kpiText = evidenceSnapshot?.revenueKPI ?? 'n/a';
  const chartText = evidenceSnapshot ? formatCurrency(evidenceSnapshot.chartTotal) : 'n/a';

  const initialTitle = evidenceSnapshot && evidenceSnapshot.country !== 'All'
    ? `[UAT] Revenue KPI does not update when Country Filter applied to "${country}"`
    : '[UAT] Sales Dashboard State Sync Discrepancy';

  const initialDescription = `During User Acceptance Testing, we observed that when the country filter is set to "${country}", the Revenue KPI remains at ${kpiText} instead of recalculating for that country, while the revenue chart and transaction table did update.`;

  const initialExpected = `When a Country filter (e.g. "${country}") is selected, the top-level "Revenue KPI" card must recalculate to match the filtered figures shown elsewhere on the dashboard (${chartText}).`;

  const initialSteps = `1. Open the Corporate Sales Dashboard.
2. Observe the initial global state (Revenue KPI shows global sales).
3. Apply the Country filter dropdown and select "${country}".
4. Compare the "Revenue KPI" card value with the revenue shown in the chart and the transaction table.
5. Note that the chart and table total ${chartText} while the KPI displays ${kpiText} (unchanged from before the filter was applied).`;

  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState('Functional - Calculation Mismatch');
  const [severity, setSeverity] = useState('Major');
  const [description, setDescription] = useState(initialDescription);
  const [expectedBehavior, setExpectedBehavior] = useState(initialExpected);
  const [reproductionSteps, setReproductionSteps] = useState(initialSteps);
  const [status, setStatus] = useState<'Draft' | 'Approved'>('Draft');
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const handleApprove = (): void => {
    setStatus('Approved');
    setApprovedAt(new Date().toISOString());
  };

  const handleRevoke = (): void => {
    setStatus('Draft');
    setApprovedAt(null);
  };

  /** Single source for both exports, so Markdown and JSON can never disagree. */
  const buildReport = (): ReturnType<typeof buildIssueReport> =>
    buildIssueReport({
      fields: { title, category, severity, description, expectedBehavior, reproductionSteps },
      status,
      approvedAt,
      investigation,
      annotations,
      events,
      now: new Date()
    });

  const handleCopyMarkdown = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(renderIssueMarkdown(buildReport()));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  const handleDownloadJSON = (): void => {
    try {
      const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `UAT_Issue_${country.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export JSON report', e);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full" data-testid="issue-draft-container">
      {/* Header */}
      <div className="bg-[#1e1e24] text-white px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-yellow-500" />
          <span className="font-bold text-sm tracking-wide">UAT Issue Review Board</span>
        </div>
        <div className="flex items-center space-x-2">
          {status === 'Approved' ? (
            <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>Approved</span>
            </span>
          ) : (
            <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Draft Mode
            </span>
          )}
        </div>
      </div>

      {/* Review Form Fields */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs text-gray-700">
        {/* Title */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Issue Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-1.5 font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-yellow-500 text-xs"
          />
        </div>

        {/* Categories & Severity Split Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-500 text-xs text-gray-700 font-medium"
            >
              <option value="Functional - Calculation Mismatch">Functional - Calculation Mismatch</option>
              <option value="UI/UX Layout Malformation">UI/UX Layout Malformation</option>
              <option value="State Sync Failure">State Sync Failure</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Severity Level</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-500 text-xs text-gray-700 font-medium"
            >
              <option value="Blocker">Blocker (Release Stop)</option>
              <option value="Major">Major (High Impact)</option>
              <option value="Minor">Minor (Cosmetic/Medium)</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Observed Behavior Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-500 text-xs font-normal"
          />
        </div>

        {/* Expected Behavior */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Expected Behavior</label>
          <textarea
            value={expectedBehavior}
            onChange={(e) => setExpectedBehavior(e.target.value)}
            rows={2}
            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-yellow-500 text-xs font-normal"
          />
        </div>

        {/* Steps to Reproduce */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Reproduction Steps</label>
          <textarea
            value={reproductionSteps}
            onChange={(e) => setReproductionSteps(e.target.value)}
            rows={3}
            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-yellow-500 text-[11px] text-gray-600"
          />
        </div>

        {/* Visual Evidence captured */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Captured Visual Evidence</label>
          <div className="flex flex-wrap gap-2.5">
            {annotations.map((anno) => (
              <div key={anno.id} className="relative">
                {anno.capturedFrameUrl ? (
                  <div
                    onClick={() => setZoomedImage(anno.capturedFrameUrl || null)}
                    className="w-24 h-16 border border-gray-200 rounded overflow-hidden relative cursor-zoom-in group bg-black hover:border-yellow-400 shadow-sm"
                  >
                    <img src={anno.capturedFrameUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                    <span className="absolute bottom-1 right-1 bg-black/70 text-white font-mono text-[9px] px-1 rounded">
                      {anno.timestampStr}
                    </span>
                    <div className="absolute inset-0 border-2 border-transparent group-hover:border-yellow-400 rounded transition-all"></div>
                  </div>
                ) : (
                  <div className="w-24 h-16 border border-dashed border-gray-300 rounded bg-gray-50 flex items-center justify-center text-center px-1 text-[10px] text-gray-400">
                    Snapshot @ {anno.timestampStr}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* A2UI Dialogue answers */}
        {a2uiAnswers.length > 0 && (
          <div className="bg-[#fcfbf9] border border-yellow-200/50 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-bold text-yellow-800 uppercase tracking-wider block">
              AI Investigator Verification Answers (A2UI Form)
            </span>
            <div className="space-y-2">
              {a2uiAnswers.map((ans, index) => (
                <div key={index} className="space-y-0.5">
                  <p className="font-semibold text-gray-800">{index + 1}. Q: {ans.question}</p>
                  <p className="text-gray-600 italic">A: {ans.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Control and Export actions */}
        <div className="flex space-x-2 pt-2">
          <button
            data-testid="copy-markdown-btn"
            onClick={handleCopyMarkdown}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded flex items-center justify-center space-x-2 transition-colors border border-gray-200"
          >
            {copied ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[11px]">Copied Markdown!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">Copy Markdown</span>
              </>
            )}
          </button>
          <button
            data-testid="download-json-btn"
            onClick={handleDownloadJSON}
            className="flex-1 bg-[#1e1e24] hover:bg-gray-800 text-white font-semibold py-2 rounded flex items-center justify-center space-x-2 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-[11px]">Download JSON</span>
          </button>
        </div>

        {status === 'Draft' ? (
          <button
            data-testid="approve-issue-btn"
            onClick={handleApprove}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded flex items-center justify-center space-x-2 transition-colors shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Approve & Finalize UAT Bug Report</span>
          </button>
        ) : (
          <div className="space-y-2">
            <button
              data-testid="revoke-approval-btn"
              onClick={handleRevoke}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 rounded flex items-center justify-center space-x-2 transition-colors"
            >
              <span>Revoke Approval (Back to Draft)</span>
            </button>
            <button
              data-testid="new-session-btn"
              onClick={onReset}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded flex items-center justify-center space-x-2 transition-colors"
            >
              <span>Start New UAT Session</span>
            </button>
          </div>
        )}
      </div>

      {/* Image Modal Viewer */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <div className="bg-white p-2 rounded-xl max-w-2xl w-full relative overflow-hidden shadow-2xl">
            <img src={zoomedImage} className="w-full max-h-96 object-contain rounded-lg" />
            <div className="text-center mt-2 font-semibold text-xs text-gray-500">
              Visual Evidence Snapshot (Highlighted by Telemetry Context)
            </div>
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 bg-black/60 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-bold"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
