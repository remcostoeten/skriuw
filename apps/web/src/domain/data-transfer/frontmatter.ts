import { parse as parseYaml } from "yaml";

const FRONTMATTER_BOUNDARY = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function scalarToString(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return String(value);
	}
	if (value instanceof Date) return value.toISOString();
	return JSON.stringify(value);
}

export function splitFrontmatter(raw: string): {
	frontmatter: Record<string, string>;
	body: string;
} {
	const match = raw.match(FRONTMATTER_BOUNDARY);
	if (!match) {
		return { frontmatter: {}, body: raw };
	}

	const frontmatter: Record<string, string> = {};
	let parsed: unknown;
	try {
		parsed = parseYaml(match[1], { schema: "core" });
	} catch {
		parsed = null;
	}

	if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			frontmatter[key] = scalarToString(value);
		}
	}

	return { frontmatter, body: raw.slice(match[0].length) };
}

export function parseYamlString(value: string | undefined): string | undefined {
	if (!value) return undefined;
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value) as string;
		} catch {
			return value.slice(1, -1);
		}
	}
	return value;
}

export function parseTagsField(value: string | undefined): string[] {
	if (!value) return [];
	const trimmed = value.trim();
	if (!trimmed || trimmed === "[]") return [];

	if (!trimmed.startsWith("[")) {
		const single = parseYamlString(trimmed);
		return single ? [single] : [];
	}

	const normalized = normalizeTagArray(trimmed);
	if (normalized) return normalized;

	return trimmed
		.slice(1, -1)
		.split(",")
		.map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
}

function normalizeTagArray(source: string): string[] | null {
	for (const candidate of [source, source.replace(/'/g, '"')]) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.map((tag) => String(tag).trim()).filter(Boolean);
			}
		} catch {
			continue;
		}
	}
	return null;
}

export function yamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function yamlTags(tags: string[]): string {
	if (!tags.length) return "";
	return `[${tags.map(yamlString).join(", ")}]`;
}
