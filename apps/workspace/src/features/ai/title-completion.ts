import type { AiCompletionEvent, AiCompletionRequest } from "@/contracts/ai";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { MAX_AI_ACTION_INPUT_BYTES, aiEditorAction, buildAiActionRequest } from "./actions/catalog";
import { startAiCompletion } from "./completion/bridge";
import { createAiCompletionConsumer } from "./completion/consumer";
import { readAiModelSelection, sameAiModel, type AiModelSelection } from "./models/selection";
import { promptLibraryEntries, selectWorkspacePrompts } from "./prompts/library";
import { startErrorMessage } from "./run/progress";

const TITLE_ACTION_ID = "title";

export { MAX_AI_ACTION_INPUT_BYTES as MAX_TITLE_INPUT_BYTES, sameAiModel, type AiModelSelection };

export type StartTitleCompletion = typeof startAiCompletion;

export type TitleCompletion = {
  model: AiModelSelection;
  request: AiCompletionRequest;
};

export type TitleReply = { ok: true; text: string } | { ok: false; message: string };

/**
 * @name titleCompletion
 * @description The request that asks the default model to title a note, built
 * from the library's title prompt so a customised copy applies. Null while no
 * model is chosen.
 *
 * @example
 * const completion = titleCompletion(store.getState(), document.markdown);
 */
export function titleCompletion(state: RendererState, input: string): TitleCompletion | null {
  const model = readAiModelSelection(state.settings);
  const action = aiEditorAction(TITLE_ACTION_ID);
  const prompt = promptLibraryEntries(selectWorkspacePrompts(state)).find(
    (entry) => entry.builtInId === TITLE_ACTION_ID,
  );
  if (model === null || action === null || prompt === undefined) {
    return null;
  }
  return {
    model,
    request: buildAiActionRequest({
      action,
      selection: model,
      systemPrompt: prompt.systemPrompt,
      parameters: prompt.parameters,
      input,
      instruction: "",
      requestId: crypto.randomUUID(),
    }),
  };
}

function terminalMessage(event: Exclude<AiCompletionEvent, { type: "delta" | "done" }>): string {
  if (event.type === "provider_error") {
    return event.error.message;
  }
  return event.type === "timeout" ? "The model took too long to answer." : "The run was cancelled.";
}

/**
 * @name runTitleCompletion
 * @description Sends a title request with no review surface and resolves with
 * the whole reply, or with the reason there is none. It never rejects. The
 * origin is recorded with the run, so each caller passes its own.
 *
 * @example
 * const reply = await runTitleCompletion(completion.request, "journal:auto-title", signal);
 */
export async function runTitleCompletion(
  request: AiCompletionRequest,
  origin: string,
  signal: AbortSignal,
  startCompletion: StartTitleCompletion = startAiCompletion,
): Promise<TitleReply> {
  let text = "";
  let settle: (reply: TitleReply) => void = () => {};
  const terminal = new Promise<TitleReply>((resolve) => {
    settle = resolve;
  });
  const consumer = createAiCompletionConsumer(request.requestId, {
    onDelta: (delta) => {
      text += delta;
    },
    onTerminal: (event) =>
      settle(
        event.type === "done" ? { ok: true, text } : { ok: false, message: terminalMessage(event) },
      ),
  });
  try {
    const handle = await startCompletion(
      request,
      origin,
      (event) => consumer.accept(event),
      signal,
    );
    const reply = await terminal;
    handle.dispose();
    return reply;
  } catch (reason) {
    consumer.dispose();
    return { ok: false, message: startErrorMessage(reason).message };
  }
}
