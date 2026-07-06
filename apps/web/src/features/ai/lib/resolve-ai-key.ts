import { getProviderFromModelId } from "@/domain/ai/constants";
import type { AiProviderKeySummary } from "@/domain/ai/types";
import type { AiKey } from "@/features/settings/store";

export type ResolvedAiKey =
	| { source: "local"; id: string; label: string; apiKey: string }
	| { source: "server"; id: string; label: string; keyId: string };

const SERVER_KEY_PRIORITY: Record<AiProviderKeySummary["status"], number> = {
	valid: 0,
	untested: 1,
	error: 2,
	rate_limited: 3,
	invalid: 4,
};

export function pickServerProviderKey(
	keys: AiProviderKeySummary[],
	provider: NonNullable<ReturnType<typeof getProviderFromModelId>>,
	excludeIds: string[] = [],
): AiProviderKeySummary | null {
	const candidates = keys.filter(
		(key) =>
			key.provider === provider && !excludeIds.includes(key.id) && key.status !== "invalid",
	);

	if (candidates.length === 0) return null;

	return candidates.toSorted(
		(a, b) => SERVER_KEY_PRIORITY[a.status] - SERVER_KEY_PRIORITY[b.status],
	)[0];
}

export function resolveAiKey({
	model,
	localKeys,
	activeLocalKeyId,
	serverKeys,
	overrideKeyId,
	exhaustedIds = [],
}: {
	model: string;
	localKeys: AiKey[];
	activeLocalKeyId: string | null;
	serverKeys: AiProviderKeySummary[];
	overrideKeyId?: string;
	exhaustedIds?: string[];
}): ResolvedAiKey | null {
	const provider = getProviderFromModelId(model) ?? "google";

	if (overrideKeyId) {
		const local = localKeys.find((key) => key.id === overrideKeyId);
		if (local) {
			return { source: "local", id: local.id, label: local.name, apiKey: local.apiKey };
		}

		const server = serverKeys.find((key) => key.id === overrideKeyId);
		if (server) {
			return { source: "server", id: server.id, label: server.label, keyId: server.id };
		}
	}

	const availableLocal = localKeys.filter((key) => !exhaustedIds.includes(key.id));
	if (availableLocal.length > 0) {
		const preferred =
			availableLocal.find((key) => key.id === activeLocalKeyId) ?? availableLocal[0];
		return {
			source: "local",
			id: preferred.id,
			label: preferred.name,
			apiKey: preferred.apiKey,
		};
	}

	const server = pickServerProviderKey(serverKeys, provider, exhaustedIds);
	if (!server) return null;

	return { source: "server", id: server.id, label: server.label, keyId: server.id };
}

export function listFallbackAiKeys({
	localKeys,
	serverKeys,
	exhaustedIds = [],
}: {
	localKeys: AiKey[];
	serverKeys: AiProviderKeySummary[];
	exhaustedIds?: string[];
}): Array<{ id: string; label: string }> {
	const local = localKeys
		.filter((key) => !exhaustedIds.includes(key.id))
		.map((key) => ({ id: key.id, label: key.name }));
	const server = serverKeys
		.filter((key) => !exhaustedIds.includes(key.id) && key.status !== "invalid")
		.map((key) => ({ id: key.id, label: key.label }));

	return [...local, ...server];
}
