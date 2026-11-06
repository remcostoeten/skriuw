import type { Node as ProseMirrorNode } from "prosemirror-model";

export const textAlignments = ["left", "center", "right"] as const;

export type TextAlignment = (typeof textAlignments)[number];

export const highlightColors = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  pink: "#fbcfe8",
  orange: "#fed7aa",
  purple: "#ddd6fe",
} as const;

export type HighlightColor = keyof typeof highlightColors;

export function isTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === "string" && textAlignments.includes(value as TextAlignment);
}

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === "string" && value in highlightColors;
}

export function textAlignmentFromDom(dom: HTMLElement): TextAlignment {
  const value = dom.getAttribute("data-text-align") ?? dom.style.textAlign;
  return isTextAlignment(value) ? value : "left";
}

export function textAlignmentAttributes(node: ProseMirrorNode): Record<string, string> {
  const textAlign = isTextAlignment(node.attrs.textAlign) ? node.attrs.textAlign : "left";
  return textAlign === "left"
    ? { "data-text-align": textAlign }
    : { "data-text-align": textAlign, style: `text-align: ${textAlign}` };
}

export const LANGUAGE_CLASS = /(?:^|\s)language-(\S+)/;
