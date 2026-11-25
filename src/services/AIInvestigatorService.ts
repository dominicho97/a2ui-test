import { formatCurrency } from '@/utils/format';
import { formatSessionTime } from '@/utils/sessionClock';

import type {
  Annotation,
  AIInvestigatorService,
  InvestigationAnalysis,
  InvestigationQuestion,
  NextQuestionContext,
  NextQuestionResult,
  TelemetryEvent
} from '@/types';

/** A filter change after which one displayed value moved and another did not. */
export interface StaleKpiEvidence {
  before: TelemetryEvent;
  after: TelemetryEvent;
}

/**
 * Looks for the pattern "country filter changed, the chart responded, the Revenue KPI did not".
 * It only compares values that were observed on screen at two points in the session, so it does
 * not need a reference ledger or any knowledge of how the target application computes its numbers.
 */
export function findStaleKpiEvidence(events: TelemetryEvent[]): StaleKpiEvidence | null {
  const ordered = [...events].sort((a, b) => a.sessionMs - b.sessionMs);
  for (let i = 1; i < ordered.length; i += 1) {
    const before = ordered[i - 1].snapshot;
    const after = ordered[i].snapshot;
    const countryChanged = before.country !== after.country;
    const kpiUnchanged = before.revenueKPI === after.revenueKPI;
    const chartMoved = before.chartTotal !== after.chartTotal;
    if (countryChanged && kpiUnchanged && chartMoved) {
      return { before: ordered[i - 1], after: ordered[i] };
    }
  }
  return null;
}

const ISSUE_KEYWORDS = ['revenue', 'kpi', 'filter', 'mismatch', 'update', 'country', 'wrong'];

const formatMoney = formatCurrency;

export class MockAIInvestigator implements AIInvestigatorService {
  /**
   * Analyzes the session's telemetry events and tester annotations.
   * Evidence comes from observed value changes between events; annotation keywords are only a
   * secondary hint, and no reference data is consulted.
   */
  async analyzeTelemetry(annotations: Annotation[], events: TelemetryEvent[]): Promise<InvestigationAnalysis> {
    return { ...(await this.buildAnalysis(annotations, events)), source: 'mock' };
  }

  async getNextQuestion(context: NextQuestionContext): Promise<NextQuestionResult> {
    return {
      question: this.getNextAdaptiveQuestion(context.questionId, context.selectedOptionIndex, context.country),
      source: 'mock'
    };
  }

  private async buildAnalysis(
    annotations: Annotation[],
    events: TelemetryEvent[]
  ): Promise<Omit<InvestigationAnalysis, 'source'>> {
    // Artificial delay to simulate real AI analysis
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const evidence = findStaleKpiEvidence(events);
    const hasKeywordHint = annotations.some((anno) => {
      const txt = anno.text.toLowerCase();
      return ISSUE_KEYWORDS.some((keyword) => txt.includes(keyword));
    });

    if (evidence) {
      const { before, after } = evidence;
      const activeCountry = after.snapshot.country;
      const kpiVal = after.snapshot.revenueKPI;
      const chartNow = formatMoney(after.snapshot.chartTotal);
      const chartBefore = formatMoney(before.snapshot.chartTotal);

      return {
        summary: `INCONSISTENT UPDATE OBSERVED (Simulated AI Investigator Analysis):
Between ${formatSessionTime(before.sessionMs)} and ${formatSessionTime(after.sessionMs)} the country filter changed from "${before.snapshot.country}" to "${activeCountry}". The revenue chart total moved from ${chartBefore} to ${chartNow}, but the "Revenue KPI" card stayed at ${kpiVal}. Two views of the same filter state responded differently.`,
        questions: [
          {
            id: 'kpi_expectation',
            prompt: `How should the "Revenue KPI" card respond when filtering by "${activeCountry}"?`,
            options: [
              `The Revenue KPI must recalculate to reflect only ${activeCountry} (the chart currently shows ${chartNow}).`,
              `The Revenue KPI is intended to always represent global revenue, so the current display of ${kpiVal} is correct.`,
              `The card should display both (e.g., "${chartNow} of ${kpiVal} Global").`
            ]
          }
        ]
      };
    }

    if (hasKeywordHint) {
      return {
        summary: `POSSIBLE ISSUE (Simulated AI Investigator Analysis):
Your notes mention a data or filter problem, but the logged events do not show a displayed value that failed to respond to a filter change. More detail is needed to classify it.`,
        questions: [
          {
            id: 'general_issue_type',
            prompt: 'What category of issue are you reporting today?',
            options: [
              'Visual layout / overlap defect',
              'Data aggregation / calculation error',
              'Interactive filter or navigation broken',
              'Other'
            ]
          }
        ]
      };
    }

    // Default general-purpose fallback analysis if they recorded something else
    return {
      summary: `GENERAL SESSION ANALYSIS (Simulated AI Investigator):
We analyzed your recording but did not detect a displayed value that failed to follow a filter change. Your annotations are recorded on the timeline.`,
      questions: [
        {
          id: 'general_issue_type',
          prompt: 'What category of issue are you reporting today?',
          options: [
            'Visual layout / overlap defect',
            'Data aggregation / calculation error',
            'Interactive filter or navigation broken',
            'Other'
          ]
        }
      ]
    };
  }

  /**
   * Adapts the next question based on the user's previous answer.
   * This provides the adaptive flow required by the UAT guidelines.
   */
  getNextAdaptiveQuestion(questionId: string, selectedOptionIndex: number, country: string): InvestigationQuestion | null {
    if (questionId === 'kpi_expectation') {
      if (selectedOptionIndex === 0) {
        // User expected the card to filter down
        return {
          id: 'scope_of_filtering',
          prompt: `Understood. Should every KPI card on the dashboard respond to the "${country}" filter in the same way as the Revenue KPI?`,
          options: [
            'Yes, all KPI cards must filter consistently by country (Revenue, Units, and Customers).',
            'No, only the Revenue KPI card is expected to filter; others can remain aggregate.'
          ]
        };
      } else if (selectedOptionIndex === 1) {
        // User says aggregate display is correct
        return {
          id: 'visual_labeling',
          prompt: 'Understood. Since the KPI is intended to represent Global Revenue, should we add a descriptive label (e.g., "Global Revenue Total") to avoid tester confusion?',
          options: [
            'Yes, a clear descriptive label is highly recommended to clarify the aggregate scope.',
            'No, the design is already clear enough.'
          ]
        };
      } else {
        // User wants dual metrics
        return {
          id: 'dual_metric_design',
          prompt: 'How should this dual-metric layout compare local and global values?',
          options: [
            'As a main local number with small global subtext (e.g. "33% of Global Sales").',
            'As a split card showing two distinct bar indicators.'
          ]
        };
      }
    }

    if (questionId === 'general_issue_type') {
      return {
        id: 'severity_assessment',
        prompt: 'How severely does this issue impact the dashboard UAT milestone?',
        options: [
          'Blocker - Must resolve before production release',
          'Major - Degrades reporting functionality',
          'Minor - Cosmestic or layout improvement'
        ]
      };
    }

    // End of questionnaire
    return null;
  }
}
