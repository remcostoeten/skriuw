"use client";

import { useAuthedApiQuery } from "@/shared/api/use-authed-api-query";
import type { AiProviderKeySummary } from "@/domain/ai/types";

export const aiProviderKeysQueryKey = ["ai", "provider-keys"] as const;

async function fetchAiProviderKeys(): Promise<AiProviderKeySummary[]> {
	const res = await fetch("/api/ai/keys");
	if (!res.ok) return [];
	const data = (await res.json()) as { keys?: AiProviderKeySummary[] };
	return data.keys ?? [];
}

export function useAiProviderKeys() {
	return useAuthedApiQuery(aiProviderKeysQueryKey, fetchAiProviderKeys, {
		staleTime: 30_000,
	});
}
