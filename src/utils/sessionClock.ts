export type SessionClockState = 'idle' | 'running' | 'paused' | 'stopped';

export type TimeSource = () => number;

const defaultTimeSource: TimeSource = () => performance.now();

/**
 * Single monotonic time reference shared by the recording, annotations and telemetry events.
 *
 * - Backed by `performance.now()`, so it is immune to wall-clock changes and to timer throttling
 *   (unlike counting `setInterval` ticks).
 * - Started from `MediaRecorder.onstart`, so 0 ms matches the first recorded video frame rather
 *   than the moment the user clicked "Start".
 * - `pause()`/`resume()` exclude paused spans, mirroring how `MediaRecorder` does not advance the
 *   video timeline while paused.
 */
export class SessionClock {
  private state: SessionClockState = 'idle';
  private accumulatedMs = 0;
  private segmentStartedAt = 0;

  constructor(private readonly timeSource: TimeSource = defaultTimeSource) {}

  getState(): SessionClockState {
    return this.state;
  }

  /** True while events may still be logged against this clock (running or paused). */
  get isActive(): boolean {
    return this.state === 'running' || this.state === 'paused';
  }

  start(): void {
    this.accumulatedMs = 0;
    this.segmentStartedAt = this.timeSource();
    this.state = 'running';
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.accumulatedMs += this.timeSource() - this.segmentStartedAt;
    this.state = 'paused';
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.segmentStartedAt = this.timeSource();
    this.state = 'running';
  }

  /** Freezes the clock; `nowMs()` keeps returning the final value. */
  stop(): void {
    if (!this.isActive) return;
    this.pause();
    this.state = 'stopped';
  }

  reset(): void {
    this.state = 'idle';
    this.accumulatedMs = 0;
    this.segmentStartedAt = 0;
  }

  /** Milliseconds on the session timeline (video-aligned). */
  nowMs(): number {
    if (this.state === 'running') {
      return Math.round(this.accumulatedMs + (this.timeSource() - this.segmentStartedAt));
    }
    return Math.round(this.accumulatedMs);
  }
}

/** Formats session milliseconds as `mm:ss` (floored to whole seconds). */
export function formatSessionTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
