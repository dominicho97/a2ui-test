import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Video, Cpu, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';

import AIInvestigatorPanel from '@/components/AIInvestigatorPanel';
import Dashboard from '@/components/Dashboard';
import IssueDraft from '@/components/IssueDraft';
import ScreenRecorder from '@/components/ScreenRecorder';
import { getTelemetrySnapshot } from '@/data/salesData';
import { createId } from '@/utils/ids';
import { SessionClock } from '@/utils/sessionClock';

import type {
  Annotation,
  InvestigationRecord,
  RecordingStatus,
  TelemetryEvent,
  TelemetryEventType,
  TelemetrySnapshot
} from '@/types';

export default function App(): ReactElement {
  // One clock for the whole session: video position, annotations and telemetry events all use it.
  const [clock] = useState<SessionClock>(() => new SessionClock());

  // Left Panel - Power BI Dashboard States
  const [country, setCountry] = useState<string>('All');
  const [period, setPeriod] = useState<string>('All');
  const [currentTelemetry, setCurrentTelemetry] = useState<TelemetrySnapshot>(() =>
    getTelemetrySnapshot('All', 'All')
  );
  // Always the latest snapshot, readable from long-lived recorder callbacks without stale closures.
  const telemetryRef = useRef<TelemetrySnapshot>(currentTelemetry);

  // Right Panel - UAT Session Recorder states
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  // Internal event log: feeds the investigator, never rendered to the person being tested.
  const [events, setEvents] = useState<TelemetryEvent[]>([]);

  // Investigation Dialogue States
  const [investigation, setInvestigation] = useState<InvestigationRecord | null>(null);

  // Right panel Tabs layout
  const [activeTab, setActiveTab] = useState<'recording' | 'investigation' | 'review'>('recording');

  const logEvent = useCallback(
    (type: TelemetryEventType, detail?: string): void => {
      const event: TelemetryEvent = {
        id: createId('evt'),
        sessionMs: clock.nowMs(),
        type,
        detail,
        snapshot: { ...telemetryRef.current }
      };
      // A new recording starts a fresh log; everything else appends.
      setEvents((prev) => (type === 'recording_started' ? [event] : [...prev, event]));
    },
    [clock]
  );

  const handleFilterChange = (c: string, p: string, telemetry: TelemetrySnapshot): void => {
    setCountry(c);
    setPeriod(p);
    setCurrentTelemetry(telemetry);
    telemetryRef.current = telemetry;
    if (clock.isActive) {
      logEvent('filter_changed', `country=${c}; period=${p}`);
    }
  };

  const handleRecordingComplete = (annos: Annotation[]): void => {
    setAnnotations(annos);
  };

  const handleInvestigationFinished = (record: InvestigationRecord): void => {
    setInvestigation(record);
    setActiveTab('review');
  };

  const handleResetSession = (): void => {
    const initial = getTelemetrySnapshot('All', 'All');
    clock.reset();
    setCountry('All');
    setPeriod('All');
    setCurrentTelemetry(initial);
    telemetryRef.current = initial;
    setAnnotations([]);
    setEvents([]);
    setInvestigation(null);
    setRecordingStatus('idle');
    setActiveTab('recording');
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col font-sans text-gray-800" data-testid="app-root">
      {/* Global Hackathon Title Header */}
      <header className="bg-[#1e1e24] text-white px-6 py-4 flex items-center justify-between border-b border-gray-800 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="bg-yellow-500 p-1.5 rounded-lg flex items-center justify-center text-black shadow-lg shadow-yellow-500/10">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-extrabold tracking-tight flex items-center space-x-2">
              <span>a2ui test</span>
              <span className="text-[10px] font-bold tracking-widest bg-yellow-500/20 text-[#f2c811] px-2 py-0.5 rounded uppercase ml-2 border border-yellow-500/30">
                UAT Hackathon MVP
              </span>
            </h1>
            <p className="text-[10px] text-gray-400">Agentic User Acceptance Testing Workspace</p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="hidden md:flex items-center space-x-1.5 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700/50">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[11px] font-medium text-gray-300">Recording Telemetry Core: Active</span>
          </div>
        </div>
      </header>

      {/* Dynamic Main Layout Workspace */}
      <div className="flex-1 flex flex-col xl:flex-row p-4 gap-4 overflow-hidden h-[calc(100vh-70px)]">
        {/* Left Side Panel - Power BI Dashboard */}
        <section className="flex-1 min-w-0 flex flex-col h-full" data-testid="dashboard-panel">
          <div className="flex items-center space-x-1.5 mb-2 px-1 text-gray-500 text-xs font-semibold uppercase tracking-wider">
            <LayoutDashboard className="w-4 h-4 text-gray-400" />
            <span>Target Dashboard Under Test</span>
          </div>
          <div className="flex-1 min-h-[500px] xl:min-h-0">
            <Dashboard
              country={country}
              period={period}
              onFilterChange={handleFilterChange}
            />
          </div>
        </section>

        {/* Right Side Panel - UAT Agent Interface Tabs */}
        <aside className="w-full xl:w-[460px] flex-shrink-0 flex flex-col h-full" data-testid="control-panel">
          {/* Workspace Controls Navigation Tabs */}
          <div className="flex bg-gray-200 p-1 rounded-xl mb-3 gap-1">
            <button
              onClick={() => setActiveTab('recording')}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'recording'
                  ? 'bg-[#1e1e24] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Record & Log</span>
            </button>
            <button
              onClick={() => {
                if (annotations.length > 0 && recordingStatus === 'stopped') {
                  setActiveTab('investigation');
                }
              }}
              disabled={annotations.length === 0 || recordingStatus !== 'stopped'}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                annotations.length === 0 || recordingStatus !== 'stopped'
                  ? 'opacity-40 cursor-not-allowed text-gray-400'
                  : activeTab === 'investigation'
                  ? 'bg-[#1e1e24] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Investigator</span>
            </button>
            <button
              onClick={() => {
                if (investigation) {
                  setActiveTab('review');
                }
              }}
              disabled={!investigation}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                !investigation
                  ? 'opacity-40 cursor-not-allowed text-gray-400'
                  : activeTab === 'review'
                  ? 'bg-[#1e1e24] text-white shadow-md'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Review Draft</span>
            </button>
          </div>

          {/* Tab Screen Contents */}
          <div className="flex-1 min-h-[400px] xl:min-h-0">
            {/* Kept mounted (just hidden) so the recording, its Blob URL and stream cleanup survive tab switches. */}
            <div className={activeTab === 'recording' ? 'h-full' : 'hidden'}>
              <ScreenRecorder
                clock={clock}
                currentTelemetry={currentTelemetry}
                onLogEvent={logEvent}
                onRecordingComplete={handleRecordingComplete}
                onReset={handleResetSession}
                recordingStatus={recordingStatus}
                setRecordingStatus={setRecordingStatus}
              />
            </div>

            {activeTab === 'investigation' && (
              <AIInvestigatorPanel
                annotations={annotations}
                events={events}
                onInvestigationFinished={handleInvestigationFinished}
                onReset={handleResetSession}
              />
            )}

            {activeTab === 'review' && investigation && (
              <IssueDraft
                annotations={annotations}
                events={events}
                investigation={investigation}
                onReset={handleResetSession}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
