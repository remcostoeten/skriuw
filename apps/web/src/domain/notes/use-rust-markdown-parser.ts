import { useCallback } from "react";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";
import type { RichTextDocument } from "@/types/notes";

export function useRustMarkdownParser() {
	const parse = useCallback(async (markdown: string): Promise<RichTextDocument | null> => {
		if (!isTauriRuntime()) {
			return null;
		}

		try {
			const blocks = await tauriInvoke<RichTextDocument>("markdown_to_rich", { markdown });
			return blocks;
		} catch (err) {
			console.error("[useRustMarkdownParser] Parse failed:", err);
			return null;
		}
	}, []);

	return { parse };
}
