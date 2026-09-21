import type { AiCompletionRequest } from "@/contracts/ai";
import {
  detectMermaidFamily,
  readMermaidPalette,
  renderMermaidSvg,
  type MermaidRenderResult,
} from "@/features/editor/mermaid-render";
import type { RunRepair } from "@/features/ai/run/run-session";

export type DiagramCheck = (source: string) => Promise<MermaidRenderResult>;

const MERMAID_FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*?)\n {0,3}\1[ \t]*$/im;

const NO_FENCE_MESSAGE = "The reply did not contain a closed ```mermaid fence.";

/** The source inside the first closed Mermaid fence of a reply, or null. */
export function mermaidFenceSource(text: string): string | null {
  const match = MERMAID_FENCE_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const source = match[2]?.trim() ?? "";
  return source.length === 0 ? null : source;
}

/**
 * What accepting a diagram run inserts. A model that wraps its fence in a
 * sentence still yields just the fence; a reply with no fence at all lands as
 * it came, so the writer can repair it by hand instead of receiving nothing.
 */
export function diagramResultText(preview: string): string {
  const source = mermaidFenceSource(preview);
  return source === null ? preview.trim() : `\`\`\`mermaid\n${source}\n\`\`\``;
}

export type DiagramResultPart =
  | { kind: "text"; text: string }
  | { kind: "diagram"; source: string };

/**
 * A reply cut into prose and drawable Mermaid fences, in order. A fence whose
 * family the renderer does not draw stays prose, so its source is still read.
 */
export function diagramResultParts(text: string): readonly DiagramResultPart[] {
  const parts: DiagramResultPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(MERMAID_FENCE_PATTERN.source, "gim"))) {
    const source = match[2]?.trim() ?? "";
    if (source.length === 0 || detectMermaidFamily(source) === "unsupported") {
      continue;
    }
    const before = text.slice(cursor, match.index);
    if (before.trim().length > 0) {
      parts.push({ kind: "text", text: before });
    }
    parts.push({ kind: "diagram", source });
    cursor = match.index + match[0].length;
  }
  const rest = text.slice(cursor);
  if (rest.trim().length > 0) {
    parts.push({ kind: "text", text: rest });
  }
  return parts;
}

function renderCheck(source: string): Promise<MermaidRenderResult> {
  return renderMermaidSvg(source, readMermaidPalette(null), {
    animate: false,
    font: "sans-serif",
  });
}

/** Why a reply would not render as a diagram, or null when it would. */
export async function diagramFailure(
  preview: string,
  check: DiagramCheck = renderCheck,
): Promise<string | null> {
  const source = mermaidFenceSource(preview);
  if (source === null) {
    return NO_FENCE_MESSAGE;
  }
  const result = await check(source);
  return result.ok ? null : result.message;
}

/**
 * The follow-up sent when a reply does not render. It carries the failed reply
 * and the renderer's own message, which is the only feedback that lets a model
 * fix a syntax error instead of guessing at a new diagram.
 */
export function diagramRepairRequest(
  request: AiCompletionRequest,
  preview: string,
  failure: string,
): AiCompletionRequest {
  return {
    ...request,
    userPrompt: `${request.userPrompt}\n\n---\n\nYour previous reply:\n\n${preview.trim()}\n\nIt could not be rendered: ${failure}\n\nReply with the corrected \`\`\`mermaid fence only.`,
  };
}

export function createDiagramRepair(check: DiagramCheck = renderCheck): RunRepair {
  return async (preview, request) => {
    const failure = await diagramFailure(preview, check);
    return failure === null ? null : diagramRepairRequest(request, preview, failure);
  };
}
