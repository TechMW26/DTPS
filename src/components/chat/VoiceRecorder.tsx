"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  Mic,
  Send,
  Trash2,
  Square,
  AlertCircle,
  Loader2,
  RotateCcw,
  Play,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob) => Promise<void> | void;
  onCancel: () => void;
  autoStart?: boolean;
  className?: string;
}

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/aac",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
] as const;

const MAX_RECORDING_SECONDS = 600;
const TIMESLICE_MS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function pickMimeType(): string {
  for (const type of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

function blobMimeType(recorderMime: string): string {
  return recorderMime.replace(/;.*$/, "").trim();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceRecorder({
  onSend,
  onCancel,
  autoStart = false,
  className,
}: VoiceRecorderProps) {
  // ---- state -----------------------------------------------------------
  const [phase, setPhase] = useState<
    "idle" | "recording" | "preview" | "sending"
  >("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [error, setError] = useState<string>("");
  const [permissionDenied, setPermissionDenied] = useState(false);

  // ---- refs ------------------------------------------------------------
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const mimeRef = useRef("audio/webm");
  const elapsedRef = useRef(0);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);

  // ---- teardown --------------------------------------------------------

  const teardown = useCallback(() => {
    console.trace("[VoiceRecorder] teardown called");
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        /* ok */
      }
      sourceNodeRef.current = null;
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // ---- reset -----------------------------------------------------------

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setAudioBlob(null);
    setWaveformData([]);
    setRecordingTime(0);
    elapsedRef.current = 0;
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setError("");
  }, []);

  // ---- mount / unmount -------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
    };
  }, [teardown]);

  // ---- auto-start (one-shot, no reactive deps) -------------------------

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const id = setTimeout(() => {
      if (mountedRef.current && phase === "idle") {
        startRecording();
      }
    }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // ---- waveform --------------------------------------------------------

  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const bars = Array.from(data.slice(0, 32)).map((v) =>
      Math.max(0.1, v / 255),
    );
    setWaveformData(bars);
    animFrameRef.current = requestAnimationFrame(animateWaveform);
  }, []);

  // ---- start recording -------------------------------------------------

  const startRecording = useCallback(async () => {
    if (phase !== "idle") return;
    setError("");
    setPermissionDenied(false);
    chunksRef.current = [];
    elapsedRef.current = 0;
    mimeRef.current = pickMimeType();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // MediaRecorder FIRST — before AudioContext (Chrome stream starvation fix)
      const mime = mimeRef.current;
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: mime.includes("aac") ? 96000 : 128000,
      });
      recorderRef.current = recorder;

      // Events MUST be registered before start()
      recorder.ondataavailable = (e) => {
        console.log(
          "[VoiceRecorder] ondataavailable:",
          e.data.size,
          "bytes, recorder state:",
          recorder.state,
        );
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!mountedRef.current) return;
        const chunkCount = chunksRef.current.length;
        const blob = new Blob(chunksRef.current, { type: blobMimeType(mime) });
        chunksRef.current = [];
        console.log("[VoiceRecorder] stopped:", {
          mime,
          blobSize: blob.size,
          chunks: chunkCount,
          elapsed: elapsedRef.current,
        });
        if (blob.size === 0) {
          setError("No audio captured. Please try again.");
          setPhase("idle");
          return;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setPhase("preview");
      };

      recorder.onerror = () => {
        teardown();
        if (mountedRef.current) {
          setError("Recording failed. Please try again.");
          setPhase("idle");
        }
      };

      // Go!
      recorder.start(TIMESLICE_MS);
      setPhase("recording");
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setRecordingTime(elapsedRef.current);
        if (elapsedRef.current >= MAX_RECORDING_SECONDS) {
          recorderRef.current?.stop();
        }
      }, 1000);

      console.log("[VoiceRecorder] started:", { mime });
    } catch (err: unknown) {
      const domErr = err instanceof DOMException ? err : null;
      console.error("[VoiceRecorder] start error:", err);
      setPermissionDenied(domErr?.name === "NotAllowedError");
      setError(
        domErr?.name === "NotAllowedError"
          ? "Microphone access denied."
          : domErr?.name === "NotFoundError"
            ? "No microphone found."
            : "Failed to start recording.",
      );
      setPhase("idle");
    }
  }, [phase, teardown]);

  // ---- stop recording --------------------------------------------------

  const stopRecording = useCallback(() => {
    if (phase !== "recording") return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    // Call requestData() BEFORE stop() to force the browser to flush any
    // buffered audio data. Both methods queue their internal tasks (ondataavailable
    // and onstop) on the same task source; the event loop processes them in FIFO
    // order — requestData's ondataavailable fires first, then stop finalises.
    // No setTimeout needed: the synchronous call order guarantees correct sequencing.
    recorder.requestData();
    recorder.stop();
  }, [phase]);

  // ---- send ------------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (!audioBlob || phase !== "preview") return;
    setPhase("sending");
    setError("");
    try {
      await onSend(audioBlob);
      if (mountedRef.current) resetToIdle();
    } catch (err) {
      console.error("[VoiceRecorder] send error:", err);
      if (mountedRef.current) {
        setError("Failed to send. Please try again.");
        setPhase("preview");
      }
    }
  }, [audioBlob, phase, onSend, resetToIdle]);

  // ---- re-record -------------------------------------------------------

  const handleRerecord = useCallback(async () => {
    resetToIdle();
    setTimeout(() => {
      if (mountedRef.current) startRecording();
    }, 100);
  }, [resetToIdle, startRecording]);

  // ---- discard ---------------------------------------------------------

  const handleDiscard = useCallback(() => {
    teardown();
    resetToIdle();
    onCancel();
  }, [teardown, resetToIdle, onCancel]);

  // ---- render ----------------------------------------------------------

  const canRecord = phase === "idle" && !permissionDenied;

  return (
    <div className={cn("bg-white border rounded-lg p-4 shadow-lg", className)}>
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        {/* Main action button */}
        {phase === "recording" ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={stopRecording}
            className="h-12 w-12 rounded-full p-0 animate-pulse shrink-0"
          >
            <Square className="w-5 h-5" />
          </Button>
        ) : phase === "preview" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const a = audioPreviewRef.current;
              if (!a) return;
              if (a.paused) {
                void a.play();
              } else {
                a.pause();
              }
            }}
            className="h-12 w-12 rounded-full p-0 shrink-0"
          >
            <Play className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={startRecording}
            disabled={!canRecord}
            className="h-12 w-12 rounded-full p-0 shrink-0"
          >
            <Mic className="w-5 h-5" />
          </Button>
        )}

        {/* Center area */}
        <div className="flex-1 min-w-0 flex items-center justify-center h-10">
          {phase === "recording" ? (
            <div className="flex items-end gap-[2px] h-8">
              {waveformData.length > 0
                ? waveformData.map((amp, i) => (
                    <div
                      key={i}
                      className="bg-green-500 rounded-full transition-all"
                      style={{ width: 2, height: `${Math.max(2, amp * 24)}px` }}
                    />
                  ))
                : Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-green-400 rounded-full animate-pulse"
                      style={{
                        width: 2,
                        height: `${4 + Math.random() * 16}px`,
                        animationDelay: `${i * 50}ms`,
                      }}
                    />
                  ))}
            </div>
          ) : phase === "preview" ? (
            <span className="text-sm text-gray-600 truncate">
              Recorded ({formatTime(recordingTime)}) — preview below
            </span>
          ) : phase === "sending" ? (
            <span className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Sending...
            </span>
          ) : permissionDenied ? (
            <span className="text-sm text-red-500">
              Microphone access required
            </span>
          ) : (
            <span className="text-sm text-gray-500">Tap mic to record</span>
          )}
        </div>

        {/* Timer */}
        <div className="text-sm font-mono text-gray-600 w-10 text-right shrink-0">
          {phase === "recording" || phase === "preview"
            ? formatTime(recordingTime)
            : ""}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 shrink-0">
          {phase === "preview" && (
            <>
              <Button size="sm" onClick={handleSend} className="h-8 px-3">
                <Send className="w-3 h-3 mr-1" /> Send
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRerecord}
                className="h-8 px-3"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Re-record
              </Button>
            </>
          )}
          {phase !== "sending" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              className="h-8 px-3"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Discard
            </Button>
          )}
        </div>
      </div>

      {/* Preview player */}
      {phase === "preview" && audioUrl && (
        <audio
          ref={audioPreviewRef}
          src={audioUrl}
          controls
          preload="metadata"
          className="w-full mt-3 h-9"
        />
      )}
    </div>
  );
}
