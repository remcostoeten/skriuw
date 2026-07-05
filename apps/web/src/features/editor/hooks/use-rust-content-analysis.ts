import { useCallback } from "react";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend";

interface ContentAnalysis {
	tags: string[];
	wikilinks: string[];
	mentions: string[];
	word_count: number;
	char_count: number;
}

export function useRustContentAnalysis() {
	const analyze = useCallback(async (markdown: string): Promise<ContentAnalysis | null> => {
		if (!isTauriRuntime()) {
			return null;
		}

		try {
			return await tauriInvoke<ContentAnalysis>("analyze_note_content", { markdown });
		} catch (err) {
			console.error("[useRustContentAnalysis] Analysis failed:", err);
			return null;
		}
	}, []);

	return { analyze };
}
