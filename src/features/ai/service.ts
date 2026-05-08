export type AiAction = "generateTitle" | "spellCheck" | "continueWriting";

export interface AiEditorHandle {
  getMarkdown: () => Promise<string>;
  replaceContent: (markdown: string) => void;
  appendContent: (markdown: string) => void;
}

export async function callAi(action: AiAction, content: string): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, content }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "Unknown error" }))) as {
      error: string;
    };
    throw new Error(error);
  }
  const { result } = (await res.json()) as { result: string };
  return result;
}
