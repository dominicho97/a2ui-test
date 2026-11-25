import { useState, type ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ScreenRecorder from '@/components/ScreenRecorder';
import { SessionClock } from '@/utils/sessionClock';

import type { Annotation, RecordingStatus, TelemetryEventType, TelemetrySnapshot } from '@/types';

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  onended: (() => void) | null = null;
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

class FakeStream {
  constructor(readonly track: FakeTrack) {}
  getTracks(): FakeTrack[] {
    return [this.track];
  }
  getVideoTracks(): FakeTrack[] {
    return [this.track];
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(): boolean {
    return true;
  }

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'video/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
    queueMicrotask(() => this.onstart?.());
  }
  pause(): void {
    this.state = 'paused';
    this.onpause?.();
  }
  resume(): void {
    this.state = 'recording';
    this.onresume?.();
  }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frame-data'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

const TELEMETRY: TelemetrySnapshot = {
  country: 'Germany',
  period: 'All',
  revenueKPI: '$3,920,000',
  chartTotal: 760000
};

interface HarnessProps {
  clock: SessionClock;
  onLogEvent: (type: TelemetryEventType, detail?: string) => void;
  onComplete?: (annotations: Annotation[]) => void;
}

function Harness({ clock, onLogEvent, onComplete }: HarnessProps): ReactElement {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  return (
    <ScreenRecorder
      clock={clock}
      currentTelemetry={TELEMETRY}
      onLogEvent={onLogEvent}
      onRecordingComplete={(annotations) => onComplete?.(annotations)}
      onReset={() => undefined}
      recordingStatus={status}
      setRecordingStatus={setStatus}
    />
  );
}

describe('ScreenRecorder', () => {
  let track: FakeTrack;
  let getDisplayMedia: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let now: number;

  beforeEach(() => {
    track = new FakeTrack();
    FakeMediaRecorder.instances = [];
    now = 0;

    getDisplayMedia = vi.fn().mockResolvedValue(new FakeStream(track));
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getDisplayMedia },
      configurable: true
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

    createObjectURL = vi.fn(() => 'blob:session-video');
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const startSession = async (onLogEvent = vi.fn(), onComplete = vi.fn()): Promise<SessionClock> => {
    const clock = new SessionClock(() => now);
    render(<Harness clock={clock} onLogEvent={onLogEvent} onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId('start-recording-btn'));
    await screen.findByTestId('stop-recording-btn');
    return clock;
  };

  it('starts the shared clock only once the recorder has started', async () => {
    const onLogEvent = vi.fn();
    const clock = await startSession(onLogEvent);
    expect(clock.getState()).toBe('running');
    expect(onLogEvent).toHaveBeenCalledWith('recording_started');
  });

  it('stamps annotations from the shared clock, not from a display timer', async () => {
    const onLogEvent = vi.fn();
    const onComplete = vi.fn();
    await startSession(onLogEvent, onComplete);

    now += 14_700;
    fireEvent.change(screen.getByTestId('annotation-input'), { target: { value: 'KPI looks off' } });
    fireEvent.click(screen.getByTestId('add-annotation-btn'));
    expect(onLogEvent).toHaveBeenCalledWith('annotation_added', 'KPI looks off');

    fireEvent.click(screen.getByTestId('stop-recording-btn'));
    await screen.findByTestId('video-player');

    const annotations = onComplete.mock.calls[0][0] as Annotation[];
    expect(annotations).toHaveLength(1);
    expect(annotations[0].sessionMs).toBe(14_700);
    expect(annotations[0].timestampStr).toBe('00:14');
    expect(annotations[0].telemetrySnapshot).toEqual(TELEMETRY);
  });

  it('keeps the clock paused while capture is interrupted', async () => {
    const clock = await startSession();
    now += 2_000;
    act(() => track.onmute?.());
    now += 6_000;
    expect(clock.nowMs()).toBe(2_000);

    act(() => track.onunmute?.());
    now += 1_000;
    expect(clock.nowMs()).toBe(3_000);
  });

  it('saves the recording and explains it when sharing is stopped from the browser', async () => {
    const onLogEvent = vi.fn();
    const onComplete = vi.fn();
    const clock = await startSession(onLogEvent, onComplete);

    track.readyState = 'ended';
    act(() => track.onended?.());

    await screen.findByTestId('video-player');
    expect(screen.getByTestId('recorder-message')).toHaveTextContent(/stopped from the browser/i);
    expect(onLogEvent).toHaveBeenCalledWith('recording_stopped', 'sharing_ended');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(clock.getState()).toBe('stopped');
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops every track and keeps a single Blob URL after a user stop', async () => {
    await startSession();
    fireEvent.click(screen.getByTestId('stop-recording-btn'));
    await screen.findByTestId('video-player');

    expect(track.stop).toHaveBeenCalled();
    expect(track.onended).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('releases the Blob URL when the recording is reset', async () => {
    await startSession();
    fireEvent.click(screen.getByTestId('stop-recording-btn'));
    await screen.findByTestId('video-player');

    fireEvent.click(screen.getByTestId('reset-recording-btn'));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:session-video'));
  });

  it('releases the Blob URL and the stream when unmounted', async () => {
    const clock = new SessionClock(() => now);
    const { unmount } = render(<Harness clock={clock} onLogEvent={vi.fn()} />);
    fireEvent.click(screen.getByTestId('start-recording-btn'));
    await screen.findByTestId('stop-recording-btn');
    fireEvent.click(screen.getByTestId('stop-recording-btn'));
    await screen.findByTestId('video-player');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:session-video');
  });

  it('stops live tracks if unmounted mid-recording', async () => {
    const clock = new SessionClock(() => now);
    const { unmount } = render(<Harness clock={clock} onLogEvent={vi.fn()} />);
    fireEvent.click(screen.getByTestId('start-recording-btn'));
    await screen.findByTestId('stop-recording-btn');

    unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances[0].state).toBe('inactive');
  });

  it('shows a clear message when permission is denied or revoked', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const clock = new SessionClock(() => now);
    render(<Harness clock={clock} onLogEvent={vi.fn()} />);

    fireEvent.click(screen.getByTestId('start-recording-btn'));

    expect(await screen.findByTestId('recorder-message')).toHaveTextContent(/permission was denied or revoked/i);
    expect(screen.getByTestId('start-recording-btn')).toBeInTheDocument();
    expect(clock.getState()).toBe('idle');
  });

  it('reports an unsupported browser instead of throwing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const clock = new SessionClock(() => now);
    render(<Harness clock={clock} onLogEvent={vi.fn()} />);

    fireEvent.click(screen.getByTestId('start-recording-btn'));

    expect(await screen.findByTestId('recorder-message')).toHaveTextContent(/not supported/i);
  });
});
