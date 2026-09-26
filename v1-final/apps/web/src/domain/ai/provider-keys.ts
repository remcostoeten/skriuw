import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { prisma } from "@/core/db";
import { AI_MODELS, DEFAULT_AI_MODEL, isAiModelId } from "@/domain/ai/constants";
import type { AiProvider, AiProviderKeyStatus, AiProviderKeySummary } from "@/domain/ai/types";
import {
	decryptApiKey,
	encryptApiKey,
	fingerprintApiKey,
	normalizeApiKey,
	normalizeLabel,
	previewApiKey,
} from "@/domain/ai/key-utils";

type KeyRecord = {
	id: string;
	provider: string;
	label: string;
	encryptedKey: string;
	keyPreview: string;
	status: string;
	lastTestedAt: Date | null;
	lastUsedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

type ProviderKeyInput = {
	userId: string;
	provider?: AiProvider;
	label: string;
	apiKey: string;
};

function toSummary(record: KeyRecord): AiProviderKeySummary {
	return {
		id: record.id,
		provider: record.provider as AiProvider,
		label: record.label,
		keyPreview: record.keyPreview,
		status: record.status as AiProviderKeyStatus,
		lastTestedAt: record.lastTestedAt?.toISOString() ?? null,
		lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

const KEY_SELECT = {
	id: true,
	provider: true,
	label: true,
	encryptedKey: true,
	keyPreview: true,
	status: true,
	lastTestedAt: true,
	lastUsedAt: true,
	createdAt: true,
	updatedAt: true,
} as const;

export async function listAiProviderKeys(userId: string): Promise<AiProviderKeySummary[]> {
	const records = await prisma.aiProviderKey.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: KEY_SELECT,
	});
	return records.map(toSummary);
}

export async function createAiProviderKey(input: ProviderKeyInput): Promise<AiProviderKeySummary> {
	const apiKey = normalizeApiKey(input.apiKey);
	const label = normalizeLabel(input.label);
	const provider = input.provider ?? "google";
	const fingerprint = fingerprintApiKey(apiKey);

	const record = await prisma.aiProviderKey.upsert({
		where: {
			userId_provider_keyFingerprint: {
				userId: input.userId,
				provider,
				keyFingerprint: fingerprint,
			},
		},
		create: {
			userId: input.userId,
			provider,
			label,
			encryptedKey: encryptApiKey(apiKey),
			keyPreview: previewApiKey(apiKey),
			keyFingerprint: fingerprint,
			status: "untested",
		},
		update: {
			label,
			encryptedKey: encryptApiKey(apiKey),
			keyPreview: previewApiKey(apiKey),
		},
		select: KEY_SELECT,
	});

	return toSummary(record);
}

export async function updateAiProviderKeyLabel({
	userId,
	keyId,
	label,
}: {
	userId: string;
	keyId: string;
	label: string;
}): Promise<AiProviderKeySummary> {
	await prisma.aiProviderKey.updateMany({
		where: { id: keyId, userId },
		data: { label: normalizeLabel(label) },
	});
	const record = await prisma.aiProviderKey.findFirstOrThrow({
		where: { id: keyId, userId },
		select: KEY_SELECT,
	});
	return toSummary(record);
}

export async function deleteAiProviderKey(userId: string, keyId: string): Promise<void> {
	await prisma.aiProviderKey.deleteMany({
		where: { id: keyId, userId },
	});
}

export async function getDecryptedAiProviderKey({
	userId,
	keyId,
}: {
	userId: string;
	keyId: string;
}): Promise<{ apiKey: string; provider: AiProvider; keyId: string } | null> {
	const record = await prisma.aiProviderKey.findFirst({
		where: { id: keyId, userId },
		select: { id: true, provider: true, encryptedKey: true },
	});
	if (!record) return null;

	await prisma.aiProviderKey.update({
		where: { id: keyId },
		data: { lastUsedAt: new Date() },
	});

	const rawProvider = record.provider as AiProvider | "gemini";
	let apiKey: string;
	try {
		apiKey = decryptApiKey(record.encryptedKey);
	} catch (err) {
		console.error("[getDecryptedAiProviderKey] Decryption failed:", err);
		throw new Error(`Cannot retrieve ${rawProvider} key. Key may be corrupted.`);
	}
	return {
		apiKey,
		provider: rawProvider === "gemini" ? "google" : rawProvider,
		keyId,
	};
}

export async function testStoredAiProviderKey({
	userId,
	keyId,
	model,
}: {
	userId: string;
	keyId: string;
	model?: string;
}): Promise<
	{ ok: true } | { ok: false; code: string; message: string; status: AiProviderKeyStatus }
> {
	const stored = await getDecryptedAiProviderKey({ userId, keyId });
	if (!stored)
		return { ok: false, code: "not_found", message: "Key not found.", status: "error" };

	const provider = stored.provider;
	const defaultModelForProvider =
		AI_MODELS.find((m) => m.provider === provider)?.id ?? DEFAULT_AI_MODEL;
	const selectedModel = isAiModelId(model) ? model : defaultModelForProvider;

	if (isAiModelId(model) && !model.startsWith(`${provider}.`)) {
		return {
			ok: false,
			code: "provider_mismatch",
			message: `The selected model requires a ${model.split(".")[0]} key but this key is for ${provider}.`,
			status: "error",
		};
	}

	let status: AiProviderKeyStatus = "valid";
	let result:
		| { ok: true }
		| { ok: false; code: string; message: string; status: AiProviderKeyStatus } = { ok: true };

	try {
		const providerInstance =
			provider === "google"
				? createGoogleGenerativeAI({ apiKey: stored.apiKey })
				: createGroq({ apiKey: stored.apiKey });

		const modelName = selectedModel.includes(".")
			? selectedModel.split(".").slice(1).join(".")
			: selectedModel;

		await generateText({
			model: providerInstance(modelName),
			prompt: "test",
			maxOutputTokens: 1,
		});
	} catch (error) {
		const providerStatus =
			(error as { status?: number }).status ??
			(error as { statusCode?: number }).statusCode ??
			null;
		const message = error instanceof Error ? error.message : "Could not test key.";
		status =
			providerStatus === 429
				? "rate_limited"
				: providerStatus === 401 || providerStatus === 403
					? "invalid"
					: "error";
		result = { ok: false, code: status, message, status };
	}

	await prisma.aiProviderKey.updateMany({
		where: { id: keyId, userId },
		data: { status, lastTestedAt: new Date() },
	});

	return result;
}
