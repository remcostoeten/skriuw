export const EDITOR_LINE_HEIGHTS = ["cozy", "comfortable", "relaxed"] as const;

export type EditorLineHeight = (typeof EDITOR_LINE_HEIGHTS)[number];

const LINE_HEIGHT_VALUES: Record<EditorLineHeight, string> = {
  cozy: "1.45",
  comfortable: "1.7",
  relaxed: "1.95",
};

const LINE_HEIGHT_LABELS: Record<EditorLineHeight, string> = {
  cozy: "Cozy",
  comfortable: "Comfortable",
  relaxed: "Relaxed",
};

export function isEditorLineHeight(value: string | null | undefined): value is EditorLineHeight {
  return (
    typeof value === "string" &&
    (EDITOR_LINE_HEIGHTS as ReadonlyArray<string>).includes(value)
  );
}

export function getEditorLineHeightValue(lineHeight: EditorLineHeight): string {
  return LINE_HEIGHT_VALUES[lineHeight];
}

export function getEditorLineHeightLabel(lineHeight: EditorLineHeight): string {
  return LINE_HEIGHT_LABELS[lineHeight];
}
