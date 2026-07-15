import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed } from "ai";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

const GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_OLLAMA_MODEL = "embeddinggemma";
const MAX_INPUT_LENGTH = 12_000;

export type SemanticSearchConfig = {
	provider: "google" | "ollama";
	model?: string;
	ollamaUrl?: string;
};

function getGoogleEmbeddingModel() {
	const apiKey = process.env.GEMINI_API_KEY;
	return apiKey
		? createGoogleGenerativeAI({ apiKey }).embeddingModel(GOOGLE_EMBEDDING_MODEL)
		: null;
}

async function createGoogleEmbedding(value: string): Promise<number[] | null> {
	const model = getGoogleEmbeddingModel();
	if (!model) return null;
	const { embedding } = await embed({
		model,
		value,
	});
	return embedding;
}

async function createOllamaEmbedding(
	value: string,
	config: SemanticSearchConfig,
): Promise<number[] | null> {
	const endpoint = (
		config.ollamaUrl ??
		process.env.SEMANTIC_SEARCH_OLLAMA_URL ??
		"http://127.0.0.1:11434"
	).replace(/\/$/, "");
	const response = await fetch(`${endpoint}/api/embed`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model: config.model ?? process.env.SEMANTIC_SEARCH_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
			input: value,
		}),
	});
	if (!response.ok) return null;
	const payload = (await response.json()) as { embeddings?: unknown };
	const embedding = Array.isArray(payload.embeddings) ? payload.embeddings[0] : null;
	return Array.isArray(embedding) && embedding.every((value) => typeof value === "number")
		? embedding
		: null;
}

export async function createNoteEmbedding(
	name: string,
	content: string,
	config: SemanticSearchConfig = {
		provider:
			(process.env.SEMANTIC_SEARCH_PROVIDER as "google" | "ollama" | undefined) ?? "google",
	},
): Promise<number[] | null> {
	const value = `${name}\n\n${content}`.slice(0, MAX_INPUT_LENGTH);
	if (config.provider === "ollama") return createOllamaEmbedding(value, config);
	return createGoogleEmbedding(value);
}

/** Best-effort indexing. Saving a note must never depend on an AI provider. */
export function refreshNoteEmbedding(
	prisma: PrismaClient,
	note: { id: string; name: string; content: string },
	config?: SemanticSearchConfig,
	userId?: string,
): void {
	void (async () => {
		const stored = userId
			? await prisma.user.findUnique({
					where: { id: userId },
					select: { editorPreferences: true },
				})
			: null;
		const storedConfig = (stored?.editorPreferences as { ai?: SemanticSearchConfig } | null)
			?.ai;
		return createNoteEmbedding(note.name, note.content, config ?? storedConfig);
	})()
		.then((embedding) => {
			if (!embedding) return;
			return prisma.note.updateMany({
				where: { id: note.id, deletedAt: null },
				data: { semanticEmbedding: embedding as Prisma.InputJsonValue },
			});
		})
		.catch(() => undefined);
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let aMagnitude = 0;
	let bMagnitude = 0;
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		dot += a[index] * b[index];
		aMagnitude += a[index] ** 2;
		bMagnitude += b[index] ** 2;
	}
	return aMagnitude && bMagnitude ? dot / Math.sqrt(aMagnitude * bMagnitude) : 0;
}
