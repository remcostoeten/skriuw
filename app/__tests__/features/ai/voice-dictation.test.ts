import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_PROMPTS } from "../../../src/features/ai/built-in-prompts";
import {
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  RECORDER_MIME_CANDIDATES,
  VOICE_DICTATION_MODES,
  buildVoiceFormatRequest,
  changeVoiceModeSelection,
  changeVoiceModelSelection,
  formatRecordingClock,
  parseVoiceMode,
  readVoiceModeSelection,
  readVoiceModelSelection,
  resolveVoiceModel,
  transcriptionMimeType,
  voiceDictationMode,
  voiceDictationOrigin,
} from "../../../src/features/ai/voice-dictation";

const CATALOGUE = [
  { providerId: "groq", modelId: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo" },
  { providerId: "gemini", modelId: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

test("every formatting mode names a prompt the shipped library actually contains", () => {
  const shipped = new Set(BUILT_IN_PROMPTS.map((prompt) => prompt.id));
  for (const mode of VOICE_DICTATION_MODES) {
    if (mode.promptId !== null) {
      assert.ok(
        shipped.has(mode.promptId),
        `mode ${mode.id} points at missing prompt ${mode.promptId}`,
      );
    }
  }
});

test("mode ids are unique and each run records its own origin", () => {
  const ids = new Set<string>();
  for (const mode of VOICE_DICTATION_MODES) {
    assert.equal(ids.has(mode.id), false, `duplicate mode ${mode.id}`);
    ids.add(mode.id);
    assert.equal(voiceDictationOrigin(mode), `voice:${mode.id}`);
  }
  assert.equal(voiceDictationMode("raw")?.promptId, null);
});

test("an unknown or missing stored mode falls back to raw", () => {
  assert.equal(parseVoiceMode(undefined).id, "raw");
  assert.equal(parseVoiceMode(42).id, "raw");
  assert.equal(parseVoiceMode("no-such-mode").id, "raw");
  assert.equal(parseVoiceMode("structure").id, "structure");
});

test("mode selection round-trips through workspace settings", () => {
  const structure = voiceDictationMode("structure");
  assert.ok(structure);
  const settings = changeVoiceModeSelection({}, structure);
  assert.equal(readVoiceModeSelection(settings).id, "structure");
});

test("model selection round-trips and clears without leaving a key behind", () => {
  const selection = { providerId: "groq", modelId: "whisper-large-v3-turbo" };
  const stored = changeVoiceModelSelection({}, selection);
  assert.deepEqual(readVoiceModelSelection(stored), selection);

  const cleared = changeVoiceModelSelection(stored, null);
  assert.equal("voiceSttModel" in cleared, false);
  assert.equal(readVoiceModelSelection(cleared), null);
});

test("a stored model wins only while the catalogue still ships it", () => {
  const stored = { providerId: "gemini", modelId: "gemini-2.5-flash" };
  assert.equal(resolveVoiceModel(stored, CATALOGUE)?.modelId, "gemini-2.5-flash");

  const removed = { providerId: "openai", modelId: "whisper-1" };
  assert.equal(resolveVoiceModel(removed, CATALOGUE)?.modelId, "whisper-large-v3-turbo");
  assert.equal(resolveVoiceModel(null, CATALOGUE)?.providerId, "groq");
  assert.equal(resolveVoiceModel(stored, []), null);
});

test("recorder mime candidates all map onto backend-accepted containers", () => {
  const accepted = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    assert.ok(
      accepted.has(transcriptionMimeType(candidate)),
      `candidate ${candidate} maps outside the contract`,
    );
  }
  assert.equal(transcriptionMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(transcriptionMimeType(""), "audio/webm");
});

test("the recording clock renders minutes and zero-padded seconds", () => {
  assert.equal(formatRecordingClock(0), "0:00");
  assert.equal(formatRecordingClock(61), "1:01");
  assert.equal(formatRecordingClock(600), "10:00");
  assert.equal(formatRecordingClock(-3), "0:00");
});

test("the duration cap stays well under the shared upload byte cap", () => {
  // Opus at the recorder's default 128 kbit/s is 16 kB/s; twice that must
  // still fit, or the cap would let a recording exceed what providers accept.
  assert.ok(MAX_RECORDING_SECONDS * 2 * 16 * 1024 < MAX_RECORDING_BYTES);
});

test("the reformat request carries the transcript as the whole user prompt", () => {
  const clean = voiceDictationMode("clean");
  assert.ok(clean);
  const request = buildVoiceFormatRequest({
    mode: clean,
    selection: { providerId: "ollama", modelId: "llama3" },
    prompt: {
      systemPrompt: "You clean up a raw speech-to-text transcript.",
      parameters: { temperatureMillis: 200, maxOutputBytes: 1024 },
    },
    transcript: "so um the plan is",
    requestId: "request-1",
  });

  assert.equal(request.userPrompt, "so um the plan is");
  assert.equal(request.providerId, "ollama");
  assert.equal(request.parameters.maxOutputBytes, 1024);
  assert.equal(request.parameters.retryCount, 0);
});
