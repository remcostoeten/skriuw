export type AiAction = "generateTitle" | "spellCheck" | "continueWriting";

export interface AiEditorHandle {
  getMarkdown: () => Promise<string>;
  replaceContent: (markdown: string) => void;
  appendContent: (markdown: string) => void;
}

export interface AiCallOptions {
  apiKey?: string | null;
  model?: string;
}

export class AiRateLimitError extends Error {
  readonly code = "rate_limited";
  constructor() {
    super("rate_limited");
    this.name = "AiRateLimitError";
  }
}

export async function callAi(
  action: AiAction,
  content: string,
  options?: AiCallOptions,
): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      content,
      ...(options?.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options?.model ? { model: options.model } : {}),
    }),
  });

  if (res.status === 429) {
    throw new AiRateLimitError();
  }

  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
      error: string;
    };
    throw new Error(error);
  }

  const { result } = (await res.json()) as { result: string };
  return result;
}
