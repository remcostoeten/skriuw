import type { AiCompletionRequest, AiTranscriptionModel } from "@/contracts/ai";
import type { WorkspaceSettings } from "@/contracts/workspace";
import type { BuiltInPrompt } from "./built-in-prompts";
import { parseAiModelSelection, type AiModelSelection } from "./model-selection";

/**
 * What happens to a transcript before it is offered for insertion. `raw`
 * inserts the provider transcript untouched; the other modes name a built-in
 * prompt from the shipped library (which a user-customised copy shadows), so
 * the wording lives in `skriuw-domain` and nowhere else.
 */
export type VoiceDictationMode = {
  id: string;
  promptId: string | null;
  label: string;
  description: string;
};

export const VOICE_DICTATION_MODES: readonly VoiceDictationMode[] = [
  {
    id: "raw",
    promptId: null,
    label: "Raw",
    description: "The transcript exactly as transcribed.",
  },
  {
    id: "clean",
    promptId: "clean-transcript",
    label: "Cleaned up",
    description: "Fillers and false starts removed, punctuation fixed.",
  },
  {
    id: "structure",
    promptId: "structure-transcript",
    label: "Structured",
    description: "Organised into headings, bullets, and task items.",
  },
];

export function voiceDictationMode(id: string): VoiceDictationMode | null {
  return VOICE_DICTATION_MODES.find((mode) => mode.id === id) ?? null;
}

/**
 * The origin recorded with the reformat completion at the provider seam, so
 * run history can tell dictation cleanups from editor actions.
 */
export function voiceDictationOrigin(mode: VoiceDictationMode): string {
  return `voice:${mode.id}`;
}

/** Mirrors `MAX_AI_AUDIO_BYTES`: the smallest upload limit among adapters. */
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;
/**
 * Opus at MediaRecorder defaults is roughly 16 kB/s, so ten minutes stays an
 * order of magnitude under the byte cap while still bounding a forgotten
 * open microphone.
 */
export const MAX_RECORDING_SECONDS = 10 * 60;
export const VOICE_FORMAT_TIMEOUT_MS = 60_000;

/**
 * The containers the recorder may negotiate, most preferred first. Every
 * entry maps onto a mime type the backend contract accepts.
 */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

/** Strips codec parameters down to the container type the contract names. */
export function transcriptionMimeType(recorderMimeType: string): string {
  const container = recorderMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return container.length > 0 ? container : "audio/webm";
}

export function formatRecordingClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function selectRawVoiceModelSetting(state: {
  settings: WorkspaceSettings;
}): unknown {
  return state.settings["voiceSttModel"];
}

export function readVoiceModelSelection(
  settings: WorkspaceSettings,
): AiModelSelection | null {
  return parseAiModelSelection(settings["voiceSttModel"]);
}

export function changeVoiceModelSelection(
  settings: WorkspaceSettings,
  selection: AiModelSelection | null,
): WorkspaceSettings {
  if (selection === null) {
    if (!("voiceSttModel" in settings)) {
      return settings;
    }
    const { voiceSttModel: _removed, ...remaining } = settings;
    return remaining;
  }
  return {
    ...settings,
    voiceSttModel: { providerId: selection.providerId, modelId: selection.modelId },
  };
}

export function selectRawVoiceModeSetting(state: {
  settings: WorkspaceSettings;
}): unknown {
  return state.settings["voiceDictationMode"];
}

export function parseVoiceMode(stored: unknown): VoiceDictationMode {
  const fallback = VOICE_DICTATION_MODES[0]!;
  if (typeof stored !== "string") {
    return fallback;
  }
  return voiceDictationMode(stored) ?? fallback;
}

export function readVoiceModeSelection(settings: WorkspaceSettings): VoiceDictationMode {
  return parseVoiceMode(settings["voiceDictationMode"]);
}

export function changeVoiceModeSelection(
  settings: WorkspaceSettings,
  mode: VoiceDictationMode,
): WorkspaceSettings {
  return { ...settings, voiceDictationMode: mode.id };
}

/**
 * The speech-to-text model for one recording, captured by value at request
 * time. A stored selection wins only while the shipped catalogue still lists
 * it, so removing an adapter downgrades to the first shipped model instead of
 * firing requests no provider answers.
 */
export function resolveVoiceModel(
  stored: AiModelSelection | null,
  catalogue: readonly AiTranscriptionModel[],
): AiTranscriptionModel | null {
  if (stored !== null) {
    const match = catalogue.find(
      (model) => model.providerId === stored.providerId && model.modelId === stored.modelId,
    );
    if (match !== undefined) {
      return match;
    }
  }
  return catalogue[0] ?? null;
}

export type VoiceFormatRequestInput = {
  mode: VoiceDictationMode;
  selection: AiModelSelection;
  prompt: Pick<BuiltInPrompt, "systemPrompt" | "parameters">;
  transcript: string;
  requestId: string;
};

/**
 * The reformat step is an ordinary completion: the transcript is the whole
 * user prompt and nothing else is added on the way to the provider.
 */
export function buildVoiceFormatRequest(
  input: VoiceFormatRequestInput,
): AiCompletionRequest {
  return {
    requestId: input.requestId,
    providerId: input.selection.providerId,
    modelId: input.selection.modelId,
    systemPrompt: input.prompt.systemPrompt,
    userPrompt: input.transcript,
    parameters: {
      maxOutputBytes: input.prompt.parameters.maxOutputBytes,
      timeoutMs: VOICE_FORMAT_TIMEOUT_MS,
      retryCount: 0,
      temperatureMillis: input.prompt.parameters.temperatureMillis,
      topPMillis: null,
    },
  };
}
