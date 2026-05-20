import { DemoFrame } from "../demo-frame";
import {
	getEditorLineHeightLabel,
	getEditorLineHeightValue,
	type EditorLineHeight,
} from "@/features/editor/lib/editor-line-height";

type LineHeightDemoProps = {
	lineHeight: EditorLineHeight;
};

export function LineHeightDemo({ lineHeight }: LineHeightDemoProps) {
	return (
		<DemoFrame title="Preview" status={getEditorLineHeightLabel(lineHeight)}>
			<div
				className="max-w-[18rem] text-[11px] text-foreground/88"
				style={{ lineHeight: getEditorLineHeightValue(lineHeight) }}
			>
				A calmer editing rhythm makes dense notes easier to scan while keeping long writing
				sessions comfortable.
			</div>
		</DemoFrame>
	);
}
