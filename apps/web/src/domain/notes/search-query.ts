export type ParsedSearchQuery = {
	text: string;
	tags: string[];
	people: string[];
};

/**
 * Splits a raw search input into free text and filters. `tag:foo`/`#foo`
 * terms become tag filters (normalized lowercase, matching how tag rows are
 * stored in note_links); `person:ann`/`$ann` become person-name filters
 * (matched case-insensitively against Person names, since person link rows
 * store ids). Everything else stays free text for the full-text engine.
 * Multiple filters are AND-ed by the backends.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
	const tags = new Set<string>();
	const people = new Set<string>();
	const textParts: string[] = [];

	for (const term of raw.trim().split(/\s+/)) {
		if (!term) continue;
		const tagMatch = /^(?:tag:|#)(.+)$/i.exec(term);
		if (tagMatch) {
			const tag = tagMatch[1].replace(/^#/, "").trim().toLowerCase();
			if (tag) tags.add(tag);
			continue;
		}
		const personMatch = /^(?:person:|\$)(.+)$/i.exec(term);
		if (personMatch) {
			const person = personMatch[1].trim().toLowerCase();
			if (person) people.add(person);
			continue;
		}
		textParts.push(term);
	}

	return { text: textParts.join(" "), tags: [...tags], people: [...people] };
}
