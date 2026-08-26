import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_RECORDING_SECONDS,
  RECORDER_MIME_CANDIDATES,
  transcriptionMimeType,
} from "./voice-dictation";

export type VoiceRecording = {
  audio: Uint8Array;
  mimeType: string;
  seconds: number;
};

export type VoiceRecorderState = {
  recording: boolean;
  /** Smoothed microphone level in `[0, 1]` for the level meter. */
  level: number;
  seconds: number;
  error: string | null;
};

const LEVEL_INTERVAL_MS = 80;

function supportedRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  return (
    RECORDER_MIME_CANDIDATES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? null
  );
}

function recorderError(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone access was denied. Allow it and try again.";
  }
  if (reason instanceof DOMException && reason.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }
  return "The microphone could not be started.";
}

/**
 * Owns one microphone capture: the `MediaRecorder` collecting the compressed
 * recording, a Web Audio analyser feeding the level meter, and the duration
 * clock with its hard stop. Nothing is requested until `start` runs from an
 * explicit user action, and every track and context is released on stop,
 * failure, and unmount alike.
 */
export function useVoiceRecorder(onAutoStop: (recording: VoiceRecording) => void) {
  const [state, setState] = useState<VoiceRecorderState>({
    recording: false,
    level: 0,
    seconds: 0,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const levelTimerRef = useRef<number | null>(null);
  const stopResolveRef = useRef<((recording: VoiceRecording) => void) | null>(null);
  const mimeTypeRef = useRef("audio/webm");
  const onAutoStopRef = useRef(onAutoStop);
  onAutoStopRef.current = onAutoStop;

  const releaseMedia = useCallback(() => {
    if (levelTimerRef.current !== null) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current !== null && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => undefined);
    }
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const finishRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    chunksRef.current = [];
    const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    releaseMedia();
    setState({ recording: false, level: 0, seconds, error: null });
    const audio = new Uint8Array(await blob.arrayBuffer());
    const recording: VoiceRecording = {
      audio,
      mimeType: transcriptionMimeType(mimeTypeRef.current),
      seconds,
    };
    const resolve = stopResolveRef.current;
    stopResolveRef.current = null;
    if (resolve !== null) {
      resolve(recording);
    } else {
      onAutoStopRef.current(recording);
    }
  }, [releaseMedia]);

  const start = useCallback(async () => {
    if (recorderRef.current !== null) {
      return;
    }
    const mimeType = supportedRecorderMimeType();
    if (mimeType === null) {
      setState({
        recording: false,
        level: 0,
        seconds: 0,
        error: "Audio recording is not supported in this environment.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.frequencyBinCount);

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void finishRecording();
      };
      recorder.start(250);
      recorderRef.current = recorder;

      levelTimerRef.current = window.setInterval(() => {
        const active = analyserRef.current;
        if (active === null) {
          return;
        }
        active.getByteFrequencyData(samples);
        let sum = 0;
        for (const sample of samples) {
          sum += sample;
        }
        const level = Math.min(1, sum / samples.length / 128);
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        setState({ recording: true, level, seconds, error: null });
        if (seconds >= MAX_RECORDING_SECONDS) {
          recorderRef.current?.stop();
        }
      }, LEVEL_INTERVAL_MS);

      setState({ recording: true, level: 0, seconds: 0, error: null });
    } catch (reason) {
      releaseMedia();
      setState({ recording: false, level: 0, seconds: 0, error: recorderError(reason) });
    }
  }, [finishRecording, releaseMedia]);

  const stop = useCallback((): Promise<VoiceRecording> | null => {
    const recorder = recorderRef.current;
    if (recorder === null || recorder.state === "inactive") {
      return null;
    }
    const finished = new Promise<VoiceRecording>((resolve) => {
      stopResolveRef.current = resolve;
    });
    recorder.stop();
    return finished;
  }, []);

  const discard = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder !== null && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    stopResolveRef.current = null;
    releaseMedia();
    setState({ recording: false, level: 0, seconds: 0, error: null });
  }, [releaseMedia]);

  useEffect(() => discard, [discard]);

  return { state, start, stop, discard };
}
