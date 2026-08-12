"use client";

import { useCallback, useState } from "react";
import { useAiProviderKeys } from "@/features/ai/hooks/use-ai-provider-keys";
import { resolveAiKey } from "@/features/ai/lib/resolve-ai-key";
import { callAi, AiRequestError } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";
import { parseGeneratedDiagram, type GeneratedDiagram } from "./ai-diagram";

export function useDiagramAi() {
	const ai = usePreferencesStore((state) => state.ai);
	const { data: serverKeys = [] } = useAiProviderKeys();
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const generate = useCallback(
		async (request: string): Promise<GeneratedDiagram | null> => {
			if (!request.trim() || isGenerating) return null;
			setIsGenerating(true);
			setError(null);
			try {
				const key = resolveAiKey({
					model: ai.model,
					localKeys: ai.keys,
					activeLocalKeyId: ai.activeKeyId,
					serverKeys,
				});
				const response = await callAi("generateDiagram", request, {
					model: ai.model,
					...(key
						? key.source === "local"
							? { apiKey: key.apiKey }
							: { keyId: key.keyId }
						: {}),
				});
				return parseGeneratedDiagram(response);
			} catch (cause) {
				setError(
					cause instanceof AiRequestError
						? cause.details
							? `${cause.message} ${cause.details}`
							: cause.message
						: cause instanceof Error
							? cause.message
							: "Diagram generation failed. Please try again.",
				);
				return null;
			} finally {
				setIsGenerating(false);
			}
		},
		[ai, isGenerating, serverKeys],
	);

	return { generate, isGenerating, error, dismissError: () => setError(null) };
}
