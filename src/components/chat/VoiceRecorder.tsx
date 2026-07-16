'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Send, Trash2, Square, AlertCircle, Loader2, RotateCcw } from 'lucide-react';

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob) => Promise<void> | void;
  onCancel: () => void;
  autoStart?: boolean;
  className?: string;
}

export function VoiceRecorder({ onSend, onCancel, autoStart = false, className }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [error, setError] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingActiveRef = useRef(false);

  const stopRecordingInternals = useCallback(() => {
    recordingActiveRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const clearRecordedAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setAudioBlob(null);
    setWaveformData([]);
    setRecordingTime(0);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return '';
    });
  }, []);

  const updateWaveform = useCallback(() => {
    if (!analyserRef.current || !recordingActiveRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    const normalizedData = Array.from(dataArray)
      .slice(0, 32)
      .map((value) => Math.max(0.1, value / 255));

    setWaveformData(normalizedData);
    animationRef.current = requestAnimationFrame(updateWaveform);
  }, []);

  // Check microphone permissions on mount
  useEffect(() => {
    checkMicrophonePermission();

    return () => {
      stopRecordingInternals();

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [audioUrl, stopRecordingInternals]);

  const checkMicrophonePermission = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support audio recording');
        setPermissionGranted(false);
        return;
      }

      // Check if we already have permission
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permission.state === 'granted') {
          setPermissionGranted(true);
        } else if (permission.state === 'denied') {
          setError('Microphone access denied. Please enable microphone permissions.');
          setPermissionGranted(false);
        }
      }
    } catch (error) {
      console.error('Error checking microphone permission:', error);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      setError('');

      if (audioBlob) {
        clearRecordedAudio();
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      setPermissionGranted(true);

      // Set up audio context for waveform visualization
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error('AudioContext not supported');
      }

      audioContextRef.current = new AudioContextClass();

      // Resume audio context if it's suspended (browser policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Determine the best audio format supported by the browser
      let mimeType = 'audio/webm';
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/wav'
      ];

      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      console.log('Using audio mimeType:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000 // 128kbps for good quality
      });
      mediaRecorderRef.current = mediaRecorder;

      // Reset chunks
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setError('No audio captured. Please try again.');
          chunksRef.current = [];
          return;
        }

        setAudioBlob(blob);
        setAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return URL.createObjectURL(blob);
        });
        chunksRef.current = [];
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording failed. Please try again.');
        stopRecordingInternals();
        setIsRecording(false);
      };

      // Start recording with timeslice for better data handling
      mediaRecorder.start(100);
      recordingActiveRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start waveform animation
      updateWaveform();
    } catch (error: unknown) {
      console.error('Error starting recording:', error);
      setPermissionGranted(false);

      const errorName = error instanceof DOMException ? error.name : '';

      if (errorName === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else if (errorName === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else if (errorName === 'NotSupportedError') {
        setError('Audio recording is not supported in your browser.');
      } else {
        setError('Failed to start recording. Please try again.');
      }
    }
  }, [audioBlob, clearRecordedAudio, stopRecordingInternals, updateWaveform]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping recording:', error);
      }

      setIsRecording(false);
      stopRecordingInternals();
    }
  }, [isRecording, stopRecordingInternals]);

  useEffect(() => {
    if (!autoStart || isRecording || audioBlob || isSending) {
      return;
    }

    void startRecording();
  }, [autoStart, audioBlob, isRecording, isSending, startRecording]);

  const handleSend = async () => {
    if (audioBlob && !isSending) {
      setIsSending(true);
      setError('');
      try {
        await onSend(audioBlob);
      } catch (err) {
        console.error('Failed to send voice message:', err);
        setError('Failed to send voice message. Please try again.');
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleRerecord = async () => {
    if (isSending) return;

    clearRecordedAudio();
    setError('');
    await startRecording();
  };

  const handleCancel = () => {
    if (isRecording) {
      stopRecording();
    }

    clearRecordedAudio();
    setError('');
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("bg-white border rounded-lg p-4 shadow-lg", className)}>
      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center space-x-3">
        {/* Recording/Play button */}
        {!audioBlob ? (
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={permissionGranted === false || isSending}
            className={cn(
              "h-10 w-10 rounded-full p-0 transition-all",
              isRecording && "animate-pulse"
            )}
          >
            {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        ) : (
          <div className="h-10 w-10 rounded-full border bg-gray-100 flex items-center justify-center text-gray-500">
            <MicOff className="w-4 h-4" />
          </div>
        )}

        {/* Waveform visualization */}
        <div className="flex-1 flex items-center justify-center h-10">
          {error ? (
            <div className="text-sm text-red-500">
              Recording unavailable
            </div>
          ) : isRecording ? (
            <div className="flex items-end space-x-1 h-8">
              {waveformData.length > 0 ? (
                waveformData.map((amplitude, index) => (
                  <div
                    key={index}
                    className="bg-green-500 rounded-full transition-all duration-150 animate-pulse"
                    style={{
                      width: '2px',
                      height: `${Math.max(2, amplitude * 24)}px`,
                    }}
                  />
                ))
              ) : (
                // Fallback animation when no waveform data
                Array.from({ length: 20 }).map((_, index) => (
                  <div
                    key={index}
                    className="bg-green-400 rounded-full animate-pulse"
                    style={{
                      width: '2px',
                      height: `${4 + Math.random() * 16}px`,
                      animationDelay: `${index * 50}ms`,
                    }}
                  />
                ))
              )}
            </div>
          ) : audioBlob ? (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <MicOff className="w-4 h-4" />
              <span>Recorded ({formatTime(recordingTime)}). Preview, then send or re-record.</span>
            </div>
          ) : permissionGranted === false ? (
            <div className="text-sm text-red-500">
              Microphone access required
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Tap to start recording
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="text-sm font-mono text-gray-600 min-w-10">
          {formatTime(recordingTime)}
        </div>

        {/* Action buttons */}
        <div className="flex space-x-2">
          {audioBlob && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleSend}
                disabled={isSending}
                className="h-8 px-3"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3 mr-1" />
                    Send
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRerecord}
                disabled={isSending}
                className="h-8 px-3"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Re-record
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isSending}
            className="h-8 px-3"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Discard
          </Button>
        </div>
      </div>

      {/* Preview player */}
      {audioUrl && !isRecording && (
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          preload="metadata"
          className="w-full mt-3 h-9"
        />
      )}
    </div>
  );
}
