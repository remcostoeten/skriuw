export const MARK_KINDS = [
	"amount",
	"count",
	"moment",
	"state",
	"person",
	"place",
	"reference",
] as const;

export type MarkKind = (typeof MARK_KINDS)[number];

export const MARK_COLORS = ["yellow", "green", "blue", "pink", "purple", "orange"] as const;

export type MarkColor = (typeof MARK_COLORS)[number];

const KIND_DEFAULT_COLOR: Record<MarkKind, MarkColor> = {
	amount: "yellow",
	count: "orange",
	moment: "blue",
	state: "green",
	person: "pink",
	place: "purple",
	reference: "purple",
};

export function defaultColorForKind(kind: MarkKind): MarkColor {
	return KIND_DEFAULT_COLOR[kind];
}

export type LivingMark = {
	id: string;
	kind: MarkKind;
	text: string;
	value: string;
	color: MarkColor;
	label?: string;
	thread?: string;
};

export type MarkAmount = {
	currency: "EUR" | "USD" | "GBP";
	value: number;
};

export type ThreadReading = {
	id: string;
	name: string;
	marks: LivingMark[];
	amounts: MarkAmount[];
	countTotal: number | null;
	states: string[];
};

const AMOUNT_PATTERN = /^\s*([€$£])\s*(-?\d[\d.,\s]*)\s*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HUMAN_DATE_PATTERN =
	/^\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?\b/i;
const STATE_WORDS = new Set([
	"backlog",
	"planned",
	"active",
	"waiting",
	"blocked",
	"done",
	"complete",
	"paid",
	"booked",
	"considering",
]);

export function isMarkKind(value: unknown): value is MarkKind {
	return typeof value === "string" && (MARK_KINDS as readonly string[]).includes(value);
}

export function isMarkColor(value: unknown): value is MarkColor {
	return typeof value === "string" && (MARK_COLORS as readonly string[]).includes(value);
}

export function inferMarkKind(text: string): MarkKind {
	const value = text.trim();
	if (AMOUNT_PATTERN.test(value)) return "amount";
	if (ISO_DATE_PATTERN.test(value) || HUMAN_DATE_PATTERN.test(value)) return "moment";
	if (/^-?\d[\d.,\s]*$/.test(value)) return "count";
	if (STATE_WORDS.has(value.toLowerCase())) return "state";
	if (/^https?:\/\//i.test(value)) return "reference";
	return "reference";
}

export type DetectedMark = {
	start: number;
	end: number;
	text: string;
	kind: MarkKind;
};

const MONTHS =
	"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

type Detector = { kind: MarkKind; pattern: RegExp };

const DETECTORS: Detector[] = [
	{ kind: "amount", pattern: /[€$£]\s?-?\d[\d.,]*\d|[€$£]\s?\d/g },
	{ kind: "moment", pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
	{
		kind: "moment",
		pattern: new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})(?:\\s+\\d{4})?\\b`, "gi"),
	},
	{
		kind: "state",
		pattern:
			/\b(?:backlog|planned|active|waiting|blocked|done|complete|paid|booked|considering)\b/gi,
	},
	{ kind: "reference", pattern: /\bhttps?:\/\/\S+/gi },
	{ kind: "count", pattern: /(?<![\w.,$€£-])\d[\d,]*(?:\.\d+)?(?![\w.,])/g },
];

export function detectMarks(text: string): DetectedMark[] {
	const hits: DetectedMark[] = [];
	for (const { kind, pattern } of DETECTORS) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			const raw = match[0];
			const start = match.index ?? 0;
			hits.push({ start, end: start + raw.length, text: raw.trim(), kind });
		}
	}

	hits.sort((left, right) => {
		if (left.start !== right.start) return left.start - right.start;
		return right.end - right.start - (left.end - left.start);
	});

	const filtered: DetectedMark[] = [];
	let cursor = 0;
	for (const hit of hits) {
		if (hit.start < cursor || !hit.text) continue;
		filtered.push(hit);
		cursor = hit.end;
	}
	return filtered;
}

export function normalizeMark(input: Partial<LivingMark>): LivingMark | null {
	const text = String(input.text ?? "").trim();
	if (!text) return null;
	const kind = isMarkKind(input.kind) ? input.kind : inferMarkKind(text);
	return {
		id: String(input.id ?? "").trim() || createMarkId(),
		kind,
		text,
		value: String(input.value ?? text).trim(),
		color: isMarkColor(input.color) ? input.color : "yellow",
		label: String(input.label ?? "").trim() || undefined,
		thread: String(input.thread ?? "").trim() || undefined,
	};
}

export function createMarkId(): string {
	const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (typeof cryptoApi?.randomUUID === "function") {
		return `mark_${cryptoApi.randomUUID().slice(0, 12)}`;
	}
	return `mark_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Reads durable inline marks from a schema-shaped rich document. The traversal
 * deliberately accepts unknown input so web, desktop and mobile can share the
 * semantic layer without importing an editor implementation.
 */
export function extractLivingMarks(document: unknown): LivingMark[] {
	const marks: LivingMark[] = [];
	const seen = new Set<string>();
	const visit = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (!value || typeof value !== "object") return;
		const node = value as Record<string, unknown>;
		if (node.type === "mark" && node.props && typeof node.props === "object") {
			const mark = normalizeMark(node.props as Partial<LivingMark>);
			if (mark && !seen.has(mark.id)) {
				seen.add(mark.id);
				marks.push(mark);
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key !== "props") visit(child);
		}
	};
	visit(document);
	return marks;
}

function parseLocalizedNumber(input: string): number | null {
	const raw = input.replace(/\s/g, "");
	if (!/^-?\d[\d.,]*$/.test(raw)) return null;
	const commaIndex = raw.lastIndexOf(",");
	const dotIndex = raw.lastIndexOf(".");
	const decimalSeparator =
		raw.includes(",") && raw.includes(".")
			? commaIndex > dotIndex
				? ","
				: "."
			: /^-?\d+[,.]\d{1,2}$/.test(raw)
				? raw.includes(",")
					? ","
					: "."
				: null;
	const normalized =
		decimalSeparator === ","
			? raw.replace(/\./g, "").replace(",", ".")
			: decimalSeparator === "."
				? raw.replace(/,/g, "")
				: raw.replace(/[.,]/g, "");
	const value = Number(normalized);
	return Number.isFinite(value) ? value : null;
}

function parseAmount(mark: LivingMark): MarkAmount | null {
	if (mark.kind !== "amount") return null;
	const match = String(mark.value || mark.text)
		.trim()
		.match(/^([€$£])\s*(-?[\d.,\s]+)$/);
	if (!match) return null;
	const currency = match[1] === "€" ? "EUR" : match[1] === "$" ? "USD" : "GBP";
	const value = parseLocalizedNumber(match[2]);
	return value === null ? null : { currency, value };
}

/**
 * A Thread name groups related sources. Unthreaded marks remain
 * visible in a quiet "Unthreaded" reading instead of disappearing.
 */
export function buildThreadReadings(marks: readonly LivingMark[]): ThreadReading[] {
	const groups = new Map<string, LivingMark[]>();
	for (const mark of marks) {
		const name = mark.thread?.trim() || "Unthreaded";
		const current = groups.get(name) ?? [];
		current.push(mark);
		groups.set(name, current);
	}
	return [...groups.entries()].map(([name, groupedMarks]) => {
		const amounts = groupedMarks.flatMap((mark) => {
			const parsed = parseAmount(mark);
			return parsed ? [parsed] : [];
		});
		const counts = groupedMarks.flatMap((mark) => {
			if (mark.kind !== "count") return [];
			const value = parseLocalizedNumber(String(mark.value || mark.text));
			return value === null ? [] : [value];
		});
		return {
			// Keep the exact name in the identity. A slug alone can collide for
			// distinct Unicode, punctuation, or case-sensitive thread names.
			id: `thread:${name}`,
			name,
			marks: groupedMarks,
			amounts,
			countTotal: counts.length ? counts.reduce((sum, value) => sum + value, 0) : null,
			states: [
				...new Set(
					groupedMarks
						.filter((mark) => mark.kind === "state")
						.map((mark) => mark.value || mark.text),
				),
			],
		};
	});
}
