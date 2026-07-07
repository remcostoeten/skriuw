import { parse as parseYaml } from "yaml";

const FRONTMATTER_BOUNDARY = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(raw: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	const match = raw.match(FRONTMATTER_BOUNDARY);
	if (!match) {
		return { frontmatter: {}, body: raw };
	}

	const frontmatter: Record<string, unknown> = {};
	let parsed: unknown;
	try {
		parsed = parseYaml(match[1], { schema: "core" });
	} catch {
		// parseYaml failed; fallback to simple key: value extraction
		const lines = match[1].split(/\r?\n/);
		for (const line of lines) {
			const colonIndex = line.indexOf(":");
			if (colonIndex > 0) {
				const key = line.slice(0, colonIndex).trim();
				const value = line.slice(colonIndex + 1).trim();
				if (key) {
					frontmatter[key] = value;
				}
			}
		}
		return { frontmatter, body: raw.slice(match[0].length) };
	}

	if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			frontmatter[key] = value instanceof Date ? value.toISOString() : value;
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

export function parseTagsField(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.flatMap((tag) => {
			const trimmed = String(tag).trim();
			return trimmed ? [trimmed] : [];
		});
	}
	if (typeof value === "string") {
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
			.flatMap((tag) => {
				const cleaned = tag.trim().replace(/^["']|["']$/g, "");
				return cleaned ? [cleaned] : [];
			});
	}
	return [];
}

function normalizeTagArray(source: string): string[] | null {
	for (const candidate of [source, source.replace(/'/g, '"')]) {
		try {
			const parsed = JSON.parse(candidate) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.flatMap((tag) => {
					const trimmed = String(tag).trim();
					return trimmed ? [trimmed] : [];
				});
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
