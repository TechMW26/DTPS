"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Play, Pause, Download, Loader2, AlertCircle } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { getMediaProxyUrl, normalizeMediaUrl } from "@/lib/media";

interface VoiceNotePlayerProps {
  audioUrl: string;
  mimeType?: string;
  duration?: number;
  className?: string;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VoiceNotePlayer({
  audioUrl,
  mimeType,
  duration: initialDuration,
  className,
  compact = false,
}: VoiceNotePlayerProps) {
  const resolvedAudioUrl = getMediaProxyUrl(audioUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, [audioBlobUrl]);

  // Initialize wavesurfer
  const initWaveSurfer = useCallback(async () => {
    if (!containerRef.current || useFallback) return;

    // Destroy any existing instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Add cache-busting to prevent stale CDN error pages from persisting.
    // Rotate every 10 minutes so repeated retries get fresh CDN responses.
    const cacheBustKey = Math.floor(Date.now() / 600000);
    const cacheBustedProxyUrl = resolvedAudioUrl.includes("?")
      ? `${resolvedAudioUrl}&_cb=${cacheBustKey}`
      : `${resolvedAudioUrl}?_cb=${cacheBustKey}`;

    try {
      // Fetch audio as a blob through our proxy so WaveSurfer gets a
      // same-origin blob URL — avoids CORS issues with ImageKit CDN.
      let blobUrl: string | null = null;
      let sourceUrl = cacheBustedProxyUrl;

      try {
        const response = await fetch(cacheBustedProxyUrl, {
          mode: "cors",
          credentials: "include",
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            blobUrl = URL.createObjectURL(blob);
            setAudioBlobUrl(blobUrl);
          }
        }
      } catch {
        // Proxy fetch failed — try a direct cache-busted URL to the raw
        // audio file (not proxied) as a last resort for WaveSurfer.
        const rawUrl = normalizeMediaUrl(audioUrl);
        if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
          const rawCacheBusted = rawUrl.includes("?")
            ? `${rawUrl}&_cb=${cacheBustKey}`
            : `${rawUrl}?_cb=${cacheBustKey}`;
          try {
            const directResponse = await fetch(rawCacheBusted, {
              mode: "cors",
            });
            if (directResponse.ok) {
              const blob = await directResponse.blob();
              if (blob.size > 0) {
                blobUrl = URL.createObjectURL(blob);
                setAudioBlobUrl(blobUrl);
              }
            }
          } catch {
            // Both proxy and direct fetch failed — WaveSurfer will try the
            // proxy URL directly (below).
          }
        }
      }

      // Resume AudioContext if suspended (required on mobile browsers
      // that block audio until a user gesture).
      const AudioCtxClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtxClass) {
        try {
          const tempCtx = new AudioCtxClass();
          if (tempCtx.state === "suspended") {
            await tempCtx.resume().catch(() => {});
          }
          setTimeout(() => tempCtx.close().catch(() => {}), 500);
        } catch {
          // AudioContext resume not supported — proceed anyway
        }
      }

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#94a3b8",
        progressColor: "#6366f1",
        cursorColor: "#4f46e5",
        barWidth: 2,
        barGap: 1,
        barRadius: 3,
        height: compact ? 36 : 48,
        normalize: true,
        backend: "WebAudio",
        url: blobUrl || sourceUrl,
      });

      // Timeout: if WaveSurfer doesn't report "ready" or "error" within
      // 12 seconds, fall back to native audio. Prevents hanging spinner.
      let initTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (isLoading && !useFallback) {
          console.warn(
            "[VoiceNotePlayer] WaveSurfer init timed out — falling back to native audio",
          );
          setIsLoading(false);
          setUseFallback(true);
          try {
            ws.destroy();
          } catch {}
          wavesurferRef.current = null;
          initTimeout = null;
        }
      }, 12000);

      ws.on("ready", () => {
        if (initTimeout) {
          clearTimeout(initTimeout);
          initTimeout = null;
        }
        setIsLoading(false);
        const dur = ws.getDuration();
        if (dur && isFinite(dur)) {
          setTotalDuration(dur);
        }
      });

      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => setIsPlaying(false));

      ws.on("timeupdate", (time) => {
        setCurrentTime(time);
      });

      ws.on("error", (err) => {
        if (initTimeout) {
          clearTimeout(initTimeout);
          initTimeout = null;
        }
        console.warn("[VoiceNotePlayer] WaveSurfer error:", err);
        // Fall back to native audio element
        setIsLoading(false);
        setUseFallback(true);
        if (ws) {
          ws.destroy();
          wavesurferRef.current = null;
        }
      });

      wavesurferRef.current = ws;
    } catch (err) {
      console.warn("[VoiceNotePlayer] WaveSurfer init error:", err);
      setIsLoading(false);
      setUseFallback(true);
    }
  }, [audioUrl, compact, resolvedAudioUrl, useFallback]);

  useEffect(() => {
    if (!useFallback) {
      initWaveSurfer();
    }

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [initWaveSurfer, useFallback]);

  const togglePlayPause = useCallback(() => {
    if (useFallback && audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => setError("Playback failed"));
      } else {
        audioRef.current.pause();
      }
      return;
    }

    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  }, [useFallback]);

  const handleAudioError = useCallback(() => {
    setError(
      "Unable to play this audio file. The format may not be supported by your browser.",
    );
  }, []);

  const handleAudioLoaded = useCallback(() => {
    setIsLoading(false);
    if (audioRef.current && !initialDuration) {
      const dur = audioRef.current.duration;
      if (dur && isFinite(dur)) {
        setTotalDuration(dur);
      }
    }
  }, [initialDuration]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
  }, []);

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg bg-red-50 p-3",
          className,
        )}
      >
        <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-600 truncate">{error}</p>
        </div>
        <a
          href={getMediaProxyUrl(audioUrl, { download: true })}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1.5 rounded-md hover:bg-red-100 text-red-600"
          title="Download audio"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg bg-gray-50 p-3",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 text-gray-400 animate-spin shrink-0" />
        <span className="text-xs text-gray-500">Loading audio...</span>
      </div>
    );
  }

  // Primary: wavesurfer.js player
  if (!useFallback) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <button
          onClick={togglePlayPause}
          className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 text-white" />
          ) : (
            <Play className="h-4 w-4 text-white ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div ref={containerRef} className="flex-1 min-w-0" />

          <span className="text-xs text-gray-500 tabular-nums shrink-0 min-w-[60px] text-right">
            {isPlaying
              ? `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
              : formatTime(totalDuration)}
          </span>
        </div>

        <a
          href={audioUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          title="Download audio"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // Fallback: native audio element
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        onClick={togglePlayPause}
        className="shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-white" />
        ) : (
          <Play className="h-4 w-4 text-white ml-0.5" />
        )}
      </button>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div
          className="h-2 bg-gray-200 rounded-full cursor-pointer overflow-hidden"
          onClick={(e) => {
            if (!audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = ratio * (totalDuration || 1);
          }}
        >
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-100"
            style={{
              width:
                totalDuration > 0
                  ? `${(currentTime / totalDuration) * 100}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      <span className="text-xs text-gray-500 tabular-nums shrink-0 min-w-[60px] text-right">
        {isPlaying
          ? `${formatTime(currentTime)} / ${formatTime(totalDuration)}`
          : formatTime(totalDuration)}
      </span>

      <a
        href={audioUrl}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        title="Download audio"
      >
        <Download className="h-4 w-4" />
      </a>

      <audio
        ref={audioRef}
        src={resolvedAudioUrl}
        preload="metadata"
        crossOrigin="anonymous"
        onError={handleAudioError}
        onLoadedMetadata={handleAudioLoaded}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
        onPlay={() => {
          // Resume suspended AudioContext on mobile (autoplay policy).
          // The native <audio> element creates its own context internally,
          // but we attempt resume through the global AudioContext if available.
          const AC =
            window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (AC) {
            try {
              const temp = new AC();
              if (temp.state === "suspended") temp.resume().catch(() => {});
              setTimeout(() => temp.close(), 100);
            } catch {}
          }
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
