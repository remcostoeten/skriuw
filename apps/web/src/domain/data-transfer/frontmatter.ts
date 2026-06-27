const FRONTMATTER_BOUNDARY = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(raw: string): {
	frontmatter: Record<string, string>;
	body: string;
} {
	const match = raw.match(FRONTMATTER_BOUNDARY);
	if (!match) {
		return { frontmatter: {}, body: raw };
	}

	const frontmatter: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separator = trimmed.indexOf(":");
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		frontmatter[key] = value;
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
	if (!value || value === "[]") return [];
	const trimmed = value.trim();
	if (!trimmed.startsWith("[")) {
		const single = parseYamlString(trimmed);
		return single ? [single] : [];
	}

	try {
		const parsed = JSON.parse(trimmed.replace(/'/g, '"')) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map((tag) => String(tag).trim()).filter(Boolean);
	} catch {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((tag) => tag.trim().replace(/^"|"$/g, ""))
			.filter(Boolean);
	}
}

export function yamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function yamlTags(tags: string[]): string {
	if (!tags.length) return "";
	return `[${tags.map(yamlString).join(", ")}]`;
}
