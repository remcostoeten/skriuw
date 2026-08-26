import type { AiTranscriptionModel, AiTranscriptionResult } from "@/contracts/ai";
import { invoke, requireDesktopRuntime } from "@/bridge/runtime";

export type TranscriptionCall = {
  requestId: string;
  providerId: string;
  modelId: string;
  mimeType: string;
  language: string | null;
};

export function aiTranscriptionCatalogue(): Promise<AiTranscriptionModel[]> {
  requireDesktopRuntime("AI transcription");
  return invoke<AiTranscriptionModel[]>("ai_transcription_catalogue");
}

/**
 * Ships one recording to the selected provider and resolves with its
 * transcript. The audio crosses IPC as raw bytes in a staging step because
 * raw-body commands are synchronous while the provider request must run off
 * the main thread; the staged copy is consumed whatever the outcome.
 */
export async function transcribeAudio(
  audio: Uint8Array,
  call: TranscriptionCall,
): Promise<AiTranscriptionResult> {
  requireDesktopRuntime("AI transcription");
  const stagedId = await invoke<string>("stage_transcription_audio", audio);
  return invoke<AiTranscriptionResult>("transcribe_staged_audio", {
    stagedId,
    requestId: call.requestId,
    providerId: call.providerId,
    modelId: call.modelId,
    mimeType: call.mimeType,
    language: call.language,
  });
}
