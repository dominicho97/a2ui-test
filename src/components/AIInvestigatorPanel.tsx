import { useState, type ReactElement } from 'react';
import { Cpu, Loader2, HelpCircle, CheckCircle, ArrowRight } from 'lucide-react';

import { findStaleKpiEvidence } from '@/services/AIInvestigatorService';
import { aiInvestigatorService } from '@/services/investigatorService';

import type {
  AnalysisSource,
  Annotation,
  InvestigationAnalysis,
  InvestigationQuestion,
  InvestigationRecord,
  TelemetryEvent
} from '@/types';

interface AIInvestigatorPanelProps {
  annotations: Annotation[];
  events: TelemetryEvent[];
  onInvestigationFinished: (record: InvestigationRecord) => void;
  onReset: () => void;
}

export default function AIInvestigatorPanel({
  annotations,
  events,
  onInvestigationFinished,
  onReset
}: AIInvestigatorPanelProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<InvestigationAnalysis | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InvestigationQuestion | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [completed, setCompleted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [source, setSource] = useState<AnalysisSource | null>(null);

  const startAnalysis = async (): Promise<void> => {
    setLoading(true);
    setAnalysis(null);
    setCurrentQuestion(null);
    setAnswers([]);
    setCompleted(false);
    setSource(null);

    try {
      const result = await aiInvestigatorService.analyzeTelemetry(annotations, events);
      setAnalysis(result);
      setSource(result.source);
      if (result.questions && result.questions.length > 0) {
        setCurrentQuestion(result.questions[0]);
      }
    } catch (e) {
      console.error('Analysis failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = async (optionIndex: number): Promise<void> => {
    if (!currentQuestion || !analysis || thinking) return;

    const newAnswer = {
      question: currentQuestion.prompt,
      answer: currentQuestion.options[optionIndex]
    };
    const history = [...answers, newAnswer];
    setAnswers((prev) => [...prev, newAnswer]);

    // Prefer the observed inconsistent update; fall back to the first annotation's snapshot.
    const evidenceSnapshot = findStaleKpiEvidence(events)?.after.snapshot ?? annotations[0]?.telemetrySnapshot;

    setThinking(true);
    try {
      const next = await aiInvestigatorService.getNextQuestion({
        questionId: currentQuestion.id,
        selectedOptionIndex: optionIndex,
        country: evidenceSnapshot?.country || 'selected country',
        history,
        annotations,
        events
      });
      setSource(next.source);
      if (next.question) {
        setCurrentQuestion(next.question);
      } else {
        setCurrentQuestion(null);
        setCompleted(true);
      }
    } catch (e) {
      console.error('Follow-up failed:', e);
      setCurrentQuestion(null);
      setCompleted(true);
    } finally {
      setThinking(false);
    }
  };

  const handleCompileDraft = (): void => {
    onInvestigationFinished({
      summary: analysis?.summary ?? null,
      analysisSource: analysis?.source ?? null,
      latestSource: source,
      answers
    });
  };

  const handleResetInvestigation = (): void => {
    setAnalysis(null);
    setCurrentQuestion(null);
    setAnswers([]);
    setCompleted(false);
    setSource(null);
    onReset();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full" data-testid="ai-investigator-container">
      {/* Header */}
      <div className="bg-[#1e1e24] text-white px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-[#f2c811]" />
          <span className="font-bold text-sm tracking-wide">AI Investigator & A2UI Dialogue</span>
        </div>
        <div
          data-testid="investigator-source"
          className="bg-yellow-500/10 text-[#f2c811] border border-yellow-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
        >
          {source === 'llm'
            ? 'Language model'
            : source === 'mock'
            ? 'Built-in fallback (model unavailable)'
            : 'Agentic Assistant'}
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {annotations.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100">
              <Cpu className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
              No live test annotations recorded yet. Record a UAT session with comments to let the AI Investigator run state-matching diagnostics.
            </p>
          </div>
        ) : !analysis && !loading ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mx-auto border border-yellow-100">
              <Cpu className="w-7 h-7 text-yellow-500" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-800">Session Evidence Ready for Diagnostics</h4>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Trigger the AI Investigator to trace active tab telemetry against manual annotation timestamps.
              </p>
            </div>
            <button
              data-testid="analyze-telemetry-btn"
              onClick={startAnalysis}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-xs px-5 py-2.5 rounded shadow-sm hover:shadow transition-all inline-flex items-center space-x-2"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Trigger Diagnostics</span>
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-14 space-y-4">
            <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-800">AI Investigator is analyzing telemetry logs...</p>
              <p className="text-[10px] text-gray-400 max-w-xs mx-auto italic">
                Correlating transaction ledger sums against active KPI display values and canvas stream coordinates...
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Analysis Diagnostics Summary Card */}
            <div className="bg-[#1e1e24] text-[#ececf1] rounded-lg p-3.5 font-mono text-[11px] leading-relaxed border border-gray-800 shadow-inner">
              <div className="flex items-center space-x-1.5 text-yellow-500 font-bold mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-ping"></span>
                <span>INVESTIGATOR DIAGNOSIS</span>
              </div>
              <p className="whitespace-pre-wrap">{analysis?.summary}</p>
            </div>

            {/* A2UI Dialogue - Interactive Adaptive Questionnaire */}
            {currentQuestion && (
              <div className="bg-yellow-50/40 border border-yellow-200/50 rounded-lg p-4 space-y-3" data-testid="a2ui-form">
                <div className="flex items-start space-x-2">
                  <HelpCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                  <div className="space-y-0.5 flex-1">
                    <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider block">
                      A2UI Clarification Dialogue (Adaptive)
                    </span>
                    <p className="font-bold text-gray-800 text-xs">{currentQuestion.prompt}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      data-testid={`a2ui-option-${index}`}
                      onClick={() => void handleOptionSelect(index)}
                      disabled={thinking}
                      className="w-full bg-white hover:bg-yellow-50/75 disabled:opacity-50 disabled:cursor-wait text-left border border-gray-200 hover:border-yellow-400 rounded-lg p-2.5 transition-all text-xs font-medium text-gray-700 hover:text-yellow-900 shadow-sm flex items-center justify-between"
                    >
                      <span>{option}</span>
                      <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {thinking && (
              <div data-testid="investigator-thinking" className="flex items-center space-x-2 text-[11px] text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500" />
                <span>Investigator is choosing the next question...</span>
              </div>
            )}

            {/* Verification Answers Stack */}
            {answers.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Answer Log</h5>
                <div className="space-y-1.5">
                  {answers.map((item, idx) => (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs flex justify-between items-start space-x-2">
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-gray-400 font-bold block">QUESTION {idx + 1}</span>
                        <p className="font-medium text-gray-700">{item.question}</p>
                        <p className="text-gray-500 italic mt-0.5">Answer: {item.answer}</p>
                      </div>
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostics completed screen */}
            {completed && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center space-y-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-green-800">Verification Session Completed</h4>
                  <p className="text-[11px] text-green-600">
                    The evidence timeline and dynamic adaptive answers have been correlated into a draft report.
                  </p>
                </div>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={handleResetInvestigation}
                    className="flex-1 bg-white hover:bg-gray-50 text-gray-600 font-semibold py-2 rounded text-xs border border-gray-200 transition-colors"
                  >
                    Restart Dialogue
                  </button>
                  <button
                    data-testid="compile-issue-btn"
                    onClick={handleCompileDraft}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded text-xs transition-colors flex items-center justify-center space-x-1"
                  >
                    <span>Compile Issue Draft</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
