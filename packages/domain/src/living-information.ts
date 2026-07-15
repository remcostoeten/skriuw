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
};

const AMOUNT_PATTERN = /^\s*([€$£])\s*(-?\d[\d.,\s]*)\s*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HUMAN_DATE_PATTERN =
	/^\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
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
	{ kind: "moment", pattern: new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})\\b`, "gi") },
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
	};
}

export function createMarkId(): string {
	if (typeof globalThis.crypto?.randomUUID === "function") {
		return `mark_${globalThis.crypto.randomUUID().slice(0, 12)}`;
	}
	return `mark_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
