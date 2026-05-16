import { DemoFrame } from "../demo-frame";
import {
  getEditorFontFamily,
  getEditorFontLabel,
  type EditorFontId,
} from "@/shared/lib/editor-fonts";

type DefaultFontDemoProps = {
  fontId: EditorFontId;
};

export function DefaultFontDemo({ fontId }: DefaultFontDemoProps) {
  return (
    <DemoFrame title="Preview" status={getEditorFontLabel(fontId)}>
      <div
        className="space-y-2 text-[11px] leading-5 text-foreground/88"
        style={{ fontFamily: getEditorFontFamily(fontId) }}
      >
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Aa Bb Cc
        </div>
        <div className="rounded-sm border border-border/70 bg-background px-2.5 py-2">
          <div className="font-medium text-foreground">The quick brown fox</div>
          <div className="text-muted-foreground">Editor text uses this family.</div>
        </div>
      </div>
    </DemoFrame>
  );
}
