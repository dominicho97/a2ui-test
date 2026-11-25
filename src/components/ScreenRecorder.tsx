import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Play, Square, Video, Plus, Eye, RotateCcw } from 'lucide-react';

import { createId } from '@/utils/ids';
import { formatSessionTime, type SessionClock } from '@/utils/sessionClock';

import type {
  Annotation,
  RecordingStatus,
  StopReason,
  TelemetryEventType,
  TelemetrySnapshot
} from '@/types';

interface ScreenRecorderProps {
  /** Shared session clock; also used by App for filter/telemetry events. */
  clock: SessionClock;
  currentTelemetry: TelemetrySnapshot;
  onLogEvent: (type: TelemetryEventType, detail?: string) => void;
  onRecordingComplete: (annotations: Annotation[]) => void;
  onReset: () => void;
  recordingStatus: RecordingStatus;
  setRecordingStatus: (status: RecordingStatus) => void;
}

const STOP_NOTICES: Record<StopReason, string | null> = {
  user: null,
  sharing_ended: 'Screen sharing was stopped from the browser. The recording captured so far has been saved.',
  recorder_error: 'The recorder stopped unexpectedly. The recording captured so far has been saved.'
};

const MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function describeCaptureError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Screen capture permission was denied or revoked.';
      case 'NotFoundError':
        return 'No screen, window or tab was available to capture.';
      case 'NotReadableError':
        return 'The selected source could not be read. It may be in use by another application.';
      case 'AbortError':
        return 'Screen capture was cancelled before it started.';
      default:
        break;
    }
  }
  return `Recording error: ${err instanceof Error ? err.message : String(err)}`;
}

export default function ScreenRecorder({
  clock,
  currentTelemetry,
  onLogEvent,
  onRecordingComplete,
  onReset,
  recordingStatus,
  setRecordingStatus
}: ScreenRecorderProps): ReactElement {
  const [displayMs, setDisplayMs] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);
  const tickRef = useRef<number | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const startingRef = useRef<boolean>(false);
  const finishingRef = useRef<boolean>(false);
  const stopReasonRef = useRef<StopReason | null>(null);
  const preserveErrorRef = useRef<boolean>(false);

  // Latest props for long-lived MediaRecorder / MediaStreamTrack handlers (avoids stale closures).
  const callbacksRef = useRef({ onLogEvent, onRecordingComplete, setRecordingStatus });
  const telemetryRef = useRef<TelemetrySnapshot>(currentTelemetry);
  useEffect(() => {
    callbacksRef.current = { onLogEvent, onRecordingComplete, setRecordingStatus };
    telemetryRef.current = currentTelemetry;
  });

  const releaseVideoUrl = useCallback((): void => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrl(null);
  }, []);

  /** Stops the tick timer and every captured track, and detaches all track listeners. */
  const stopStream = useCallback((): void => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.onended = null;
        track.onmute = null;
        track.onunmute = null;
        track.stop();
      });
      streamRef.current = null;
    }
    const hiddenVideo = hiddenVideoRef.current;
    if (hiddenVideo) {
      hiddenVideo.pause();
      hiddenVideo.srcObject = null;
      hiddenVideoRef.current = null;
    }
  }, []);

  /** Detaches handlers (so no callbacks fire) and stops the recorder if still active. */
  const detachRecorder = useCallback((): void => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstart = null;
    recorder.onpause = null;
    recorder.onresume = null;
    recorder.onerror = null;
    recorder.onstop = null;
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (e) {
        console.error('Failed to stop MediaRecorder during cleanup:', e);
      }
    }
    recorderRef.current = null;
  }, []);

  // Parent-triggered resets (and failed starts) return the status to 'idle'.
  useEffect(() => {
    if (recordingStatus !== 'idle') return;
    setDisplayMs(0);
    setFeedbackText('');
    setAnnotations([]);
    setSelectedAnnotationId(null);
    if (preserveErrorRef.current) {
      preserveErrorRef.current = false;
    } else {
      setErrorMsg(null);
    }
    annotationsRef.current = [];
    clock.reset();
    releaseVideoUrl();
  }, [recordingStatus, clock, releaseVideoUrl]);

  // Release the stream, recorder and Blob URL when the component goes away.
  useEffect(() => {
    return () => {
      detachRecorder();
      stopStream();
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = null;
      }
    };
  }, [detachRecorder, stopStream]);

  /** Single exit path for user stop, browser "Stop sharing", revoked permission and recorder errors. */
  const finishRecording = useCallback(
    (reason: StopReason): void => {
      const recorder = recorderRef.current;
      if (!recorder || finishingRef.current) return;
      finishingRef.current = true;
      stopReasonRef.current = reason;
      clock.stop();
      callbacksRef.current.onLogEvent('recording_stopped', reason);
      if (recorder.state !== 'inactive') {
        recorder.stop(); // `onstop` builds the Blob once the final chunk has been flushed
      }
      stopStream();
    },
    [clock, stopStream]
  );

  const startRecording = async (): Promise<void> => {
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;

    releaseVideoUrl();
    chunksRef.current = [];
    annotationsRef.current = [];
    stopReasonRef.current = null;
    finishingRef.current = false;
    preserveErrorRef.current = false;
    clock.reset();
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setErrorMsg(null);
    setDisplayMs(0);

    try {
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Screen recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('The selected source did not provide a video track.');
      }

      // Browser "Stop sharing" button, or permission revoked while recording.
      videoTrack.onended = () => finishRecording('sharing_ended');

      // Hidden video element used to grab evidence frames while recording.
      const hiddenVideo = document.createElement('video');
      hiddenVideo.srcObject = stream;
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideoRef.current = hiddenVideo;
      await hiddenVideo.play();

      if (videoTrack.readyState === 'ended') {
        throw new DOMException('Screen sharing ended before recording started.', 'AbortError');
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // The session clock starts when the recorder actually starts, so 0 ms == first video frame.
      recorder.onstart = () => {
        clock.start();
        setDisplayMs(0);
        tickRef.current = window.setInterval(() => setDisplayMs(clock.nowMs()), 250);
        callbacksRef.current.setRecordingStatus('recording');
        callbacksRef.current.onLogEvent('recording_started');
      };

      // The clock follows the recorder's real state so paused spans never skew timestamps.
      recorder.onpause = () => {
        clock.pause();
        callbacksRef.current.onLogEvent('recording_paused');
      };
      recorder.onresume = () => {
        clock.resume();
        callbacksRef.current.onLogEvent('recording_resumed');
      };

      // Capture source interrupted (e.g. shared window minimised): pause recorder and clock together.
      videoTrack.onmute = () => {
        callbacksRef.current.onLogEvent('capture_interrupted');
        if (recorder.state === 'recording') recorder.pause();
      };
      videoTrack.onunmute = () => {
        callbacksRef.current.onLogEvent('capture_resumed');
        if (recorder.state === 'paused') recorder.resume();
      };

      recorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event);
        finishRecording('recorder_error');
      };

      recorder.onstop = () => {
        // The recorder can stop by itself when its track ends, before `track.onended` is delivered.
        const reason: StopReason =
          stopReasonRef.current ?? (videoTrack.readyState === 'ended' ? 'sharing_ended' : 'recorder_error');
        if (!finishingRef.current) {
          callbacksRef.current.onLogEvent('recording_stopped', reason);
        }
        const chunks = chunksRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        finishingRef.current = false;
        clock.stop();
        stopStream();

        if (chunks.length === 0) {
          preserveErrorRef.current = true;
          setErrorMsg('No video data was captured, so there is nothing to review.');
          callbacksRef.current.setRecordingStatus('idle');
          return;
        }

        const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
        releaseVideoUrl();
        videoUrlRef.current = url;
        setVideoUrl(url);
        setErrorMsg(STOP_NOTICES[reason]);
        callbacksRef.current.setRecordingStatus('stopped');
        callbacksRef.current.onRecordingComplete(annotationsRef.current);
      };

      recorder.start(1000);
    } catch (err: unknown) {
      console.error('Error starting screen recording:', err);
      detachRecorder();
      stopStream();
      clock.reset();
      setErrorMsg(describeCaptureError(err));
      setRecordingStatus('idle');
    } finally {
      startingRef.current = false;
    }
  };

  /** Raw frame from the live capture. No defect-specific overlay is drawn on the evidence. */
  const captureFrame = (): string | undefined => {
    const hiddenVideo = hiddenVideoRef.current;
    if (!hiddenVideo || hiddenVideo.videoWidth === 0) return undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = hiddenVideo.videoWidth;
      canvas.height = hiddenVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('Failed to capture screen frame:', e);
      return undefined;
    }
  };

  const addAnnotation = (): void => {
    const text = feedbackText.trim();
    if (!text || !clock.isActive) return;

    // Timestamp, frame and telemetry are all taken at the same instant from the shared clock.
    const sessionMs = clock.nowMs();
    const annotation: Annotation = {
      id: createId('anno'),
      sessionMs,
      timestampStr: formatSessionTime(sessionMs),
      text,
      capturedFrameUrl: captureFrame(),
      telemetrySnapshot: { ...telemetryRef.current }
    };

    annotationsRef.current = [...annotationsRef.current, annotation];
    setAnnotations((prev) => [...prev, annotation]);
    setFeedbackText('');
    onLogEvent('annotation_added', text);
  };

  const handleAnnotationClick = (anno: Annotation): void => {
    setSelectedAnnotationId(anno.id);
    const player = videoPlayerRef.current;
    if (player) {
      player.currentTime = anno.sessionMs / 1000;
      player.play().catch((e: unknown) => console.error('Playback was blocked:', e));
    }
  };

  const handleResetClick = (): void => {
    detachRecorder();
    stopStream();
    clock.reset();
    setRecordingStatus('idle');
    onReset();
  };

  const isPaused = clock.getState() === 'paused';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full" data-testid="screen-recorder-container">
      {/* Header */}
      <div className="bg-[#1e1e24] text-white px-4 py-3 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <Video className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-bold text-sm tracking-wide">UAT Session Recorder</span>
        </div>
        {recordingStatus === 'recording' && (
          <div
            data-testid="rec-indicator"
            className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-mono flex items-center space-x-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            <span>
              {isPaused ? 'PAUSED' : 'REC'} {formatSessionTime(displayMs)}
            </span>
          </div>
        )}
      </div>

      {/* Recording Screen Options */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4">
        {errorMsg && (
          <div
            data-testid="recorder-message"
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 font-medium"
          >
            {errorMsg}
          </div>
        )}

        {recordingStatus === 'idle' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
              <Video className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-800">No active recording session</h4>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Initiate a live screen recording to track dashboard behavior and record timestamped annotations.
              </p>
            </div>
            <button
              data-testid="start-recording-btn"
              onClick={startRecording}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-5 py-2.5 rounded shadow-sm hover:shadow transition-all inline-flex items-center space-x-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Screen Recording</span>
            </button>
          </div>
        )}

        {recordingStatus === 'recording' && (
          <div className="space-y-4">
            <div className="bg-red-50/50 border border-red-100 rounded-lg p-3 text-center space-y-2">
              <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block">Recording Live Telemetry</span>
              <p className="text-xs text-gray-500">
                Interact with the dashboard on the left. Filter changes and notes are logged on the same clock as the video.
              </p>
              <button
                data-testid="stop-recording-btn"
                onClick={() => finishRecording('user')}
                className="bg-gray-800 hover:bg-gray-900 text-white font-semibold text-xs px-4 py-2 rounded inline-flex items-center space-x-2 transition-all"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop Sharing & Capture</span>
              </button>
            </div>

            {/* In-recording Annotations Panel */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
                Type Instant Feedback Note
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  data-testid="annotation-input"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe what you observed..."
                  onKeyDown={(e) => e.key === 'Enter' && addAnnotation()}
                  className="flex-1 bg-gray-50 border border-gray-300 rounded px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button
                  data-testid="add-annotation-btn"
                  onClick={addAnnotation}
                  disabled={!feedbackText.trim()}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white p-2 rounded transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-[10px] text-gray-400 block italic">
                Press Enter to log. The note is stamped on the video timeline at{' '}
                <span className="font-mono font-bold text-red-500">{formatSessionTime(displayMs)}</span>.
              </span>
              {annotations.length > 0 && (
                <span data-testid="annotation-count" className="text-[10px] text-gray-500 block">
                  {annotations.length} note{annotations.length === 1 ? '' : 's'} logged
                </span>
              )}
            </div>
          </div>
        )}

        {/* Video Replay & Captured Annotations Timeline */}
        {recordingStatus === 'stopped' && videoUrl && (
          <div className="space-y-4">
            <div className="rounded-lg overflow-hidden border border-gray-200 bg-black">
              <video
                ref={videoPlayerRef}
                src={videoUrl}
                controls
                playsInline
                className="w-full max-h-48 object-contain"
                data-testid="video-player"
              />
            </div>

            {/* Annotations Timeline Feed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Captured Event Annotations</span>
                <button
                  data-testid="reset-recording-btn"
                  onClick={handleResetClick}
                  className="text-gray-400 hover:text-gray-600 text-[11px] font-medium flex items-center space-x-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Recording</span>
                </button>
              </div>

              {annotations.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 text-center border border-dashed border-gray-200">
                  <span className="text-xs text-gray-400">No annotations captured during the session.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {annotations.map((anno) => (
                    <button
                      type="button"
                      key={anno.id}
                      data-testid={`annotation-item-${anno.id}`}
                      onClick={() => handleAnnotationClick(anno)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-start space-x-2.5 ${
                        selectedAnnotationId === anno.id
                          ? 'border-red-500 bg-red-50/40 shadow-sm'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span className="bg-red-100 text-red-700 font-bold font-mono px-1.5 py-0.5 rounded text-[10px]">
                        {anno.timestampStr}
                      </span>
                      <div className="flex-1 space-y-1">
                        <p className="text-gray-700 font-medium leading-relaxed">{anno.text}</p>
                        <div className="text-[10px] text-gray-400 flex items-center space-x-2">
                          <span>Filter: <strong className="text-gray-600">{anno.telemetrySnapshot.country}</strong></span>
                          <span>•</span>
                          <span>Period: <strong className="text-gray-600">{anno.telemetrySnapshot.period}</strong></span>
                        </div>
                      </div>
                      {anno.capturedFrameUrl && (
                        <div className="w-10 h-10 border border-gray-200 rounded overflow-hidden bg-gray-100 flex-shrink-0 relative group">
                          <img src={anno.capturedFrameUrl} alt={`Frame at ${anno.timestampStr}`} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
