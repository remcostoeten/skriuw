export type NotePropertyType =
	| "text"
	| "number"
	| "date"
	| "select"
	| "multi-select"
	| "person"
	| "url"
	| "checkbox"
	| "rating"
	| "location"
	| "email"
	| "phone";

export type NotePropertyColor =
	| "gray"
	| "stone"
	| "amber"
	| "green"
	| "blue"
	| "teal"
	| "rose"
	| "red";

export type NotePropertyValue = string | number | boolean | string[] | null;

export type NotePropertyOption = {
	id: string;
	label: string;
	color: NotePropertyColor;
};

export const NOTE_PROPERTY_COLORS: Record<
	NotePropertyColor,
	{ bg: string; fg: string; dot: string }
> = {
	gray: { bg: "oklch(0.32 0 0)", fg: "oklch(0.88 0 0)", dot: "oklch(0.7 0 0)" },
	stone: { bg: "oklch(0.34 0.015 70)", fg: "oklch(0.9 0.02 70)", dot: "oklch(0.74 0.04 70)" },
	amber: { bg: "oklch(0.36 0.06 75)", fg: "oklch(0.9 0.08 85)", dot: "oklch(0.8 0.12 80)" },
	green: { bg: "oklch(0.34 0.05 150)", fg: "oklch(0.9 0.07 150)", dot: "oklch(0.78 0.13 150)" },
	blue: { bg: "oklch(0.36 0.06 250)", fg: "oklch(0.9 0.06 250)", dot: "oklch(0.78 0.12 250)" },
	teal: { bg: "oklch(0.35 0.05 195)", fg: "oklch(0.9 0.06 195)", dot: "oklch(0.78 0.1 195)" },
	rose: { bg: "oklch(0.36 0.06 10)", fg: "oklch(0.9 0.06 10)", dot: "oklch(0.78 0.13 10)" },
	red: { bg: "oklch(0.36 0.08 25)", fg: "oklch(0.9 0.08 25)", dot: "oklch(0.78 0.16 25)" },
};

export const NOTE_PROPERTY_COLOR_KEYS = Object.keys(NOTE_PROPERTY_COLORS) as NotePropertyColor[];

export type NoteProperty = {
	id: string;
	type: NotePropertyType;
	name: string;
	value: NotePropertyValue;
	options?: NotePropertyOption[];
};

export type NotePropertyTemplate = {
	id: string;
	name: string;
	description: string;
	tags: string[];
	build: () => NoteProperty[];
};

export type CustomNotePropertyTemplate = {
	id: string;
	name: string;
	properties: NoteProperty[];
};

export const NOTE_PROPERTY_TYPES: Array<{
	type: NotePropertyType;
	label: string;
	description: string;
}> = [
	{ type: "text", label: "Text", description: "A short note or sentence" },
	{ type: "number", label: "Number", description: "Counts, amounts, IDs" },
	{ type: "date", label: "Date", description: "A day or deadline" },
	{ type: "select", label: "Select", description: "One option from a list" },
	{ type: "multi-select", label: "Multi-select", description: "Several options or labels" },
	{ type: "person", label: "Person", description: "People, authors, attendees" },
	{ type: "url", label: "URL", description: "A link to a source" },
	{ type: "checkbox", label: "Checkbox", description: "A yes / no toggle" },
	{ type: "rating", label: "Rating", description: "Stars out of five" },
	{ type: "location", label: "Location", description: "A place or address" },
	{ type: "email", label: "Email", description: "An email address" },
	{ type: "phone", label: "Phone", description: "A phone number" },
];

const PROPERTY_TYPE_SET = new Set(NOTE_PROPERTY_TYPES.map((property) => property.type));
const PROPERTY_COLORS: NotePropertyColor[] = [
	"gray",
	"stone",
	"amber",
	"green",
	"blue",
	"teal",
	"rose",
	"red",
];
const PROPERTY_COLOR_SET = new Set<string>(PROPERTY_COLORS);

let idCounter = 0;

export function createNotePropertyId(prefix = "prop"): string {
	idCounter += 1;
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
	}
	return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyNotePropertyValue(type: NotePropertyType): NotePropertyValue {
	switch (type) {
		case "checkbox":
			return false;
		case "number":
		case "rating":
			return null;
		case "multi-select":
		case "person":
			return [];
		default:
			return "";
	}
}

export function createNoteProperty(
	type: NotePropertyType,
	name = NOTE_PROPERTY_TYPES.find((property) => property.type === type)?.label ?? "Untitled",
): NoteProperty {
	return {
		id: createNotePropertyId(),
		type,
		name,
		value: emptyNotePropertyValue(type),
		...(type === "select" || type === "multi-select" || type === "person"
			? { options: [] }
			: {}),
	};
}

function option(label: string, color: NotePropertyColor): NotePropertyOption {
	return { id: createNotePropertyId("opt"), label, color };
}

function dateToday(): string {
	return new Date().toISOString().slice(0, 10);
}

export const NOTE_PROPERTY_TEMPLATES: NotePropertyTemplate[] = [
	{
		id: "blank",
		name: "Blank",
		description: "Start with an empty intro shelf.",
		tags: [],
		build: () => [],
	},
	{
		id: "meeting",
		name: "Meeting",
		description: "Date, attendees, status and location.",
		tags: ["meeting"],
		build: () => [
			{ id: createNotePropertyId(), type: "date", name: "Date", value: dateToday() },
			{ id: createNotePropertyId(), type: "person", name: "Attendees", value: [] },
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Status",
				value: null,
				options: [
					option("Scheduled", "blue"),
					option("In progress", "amber"),
					option("Done", "green"),
				],
			},
			{ id: createNotePropertyId(), type: "location", name: "Location", value: "" },
		],
	},
	{
		id: "project",
		name: "Project",
		description: "Track status, owner, priority and a deadline.",
		tags: ["project"],
		build: () => [
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Status",
				value: null,
				options: [
					option("Backlog", "gray"),
					option("Planned", "blue"),
					option("Active", "amber"),
					option("Shipped", "green"),
				],
			},
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Priority",
				value: null,
				options: [option("Low", "gray"), option("Medium", "amber"), option("High", "red")],
			},
			{ id: createNotePropertyId(), type: "person", name: "Owner", value: [] },
			{ id: createNotePropertyId(), type: "date", name: "Due", value: "" },
			{
				id: createNotePropertyId(),
				type: "multi-select",
				name: "Tags",
				value: [],
				options: [],
			},
			{ id: createNotePropertyId(), type: "url", name: "Link", value: "" },
		],
	},
	{
		id: "person",
		name: "Contact",
		description: "Keep a person's details in one place.",
		tags: ["contact"],
		build: () => [
			{ id: createNotePropertyId(), type: "email", name: "Email", value: "" },
			{ id: createNotePropertyId(), type: "phone", name: "Phone", value: "" },
			{ id: createNotePropertyId(), type: "text", name: "Company", value: "" },
			{ id: createNotePropertyId(), type: "location", name: "Location", value: "" },
		],
	},
	{
		id: "journal",
		name: "Journal",
		description: "A dated entry with mood and energy.",
		tags: ["journal"],
		build: () => [
			{ id: createNotePropertyId(), type: "date", name: "Date", value: dateToday() },
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Mood",
				value: null,
				options: [
					option("Great", "green"),
					option("Good", "teal"),
					option("Okay", "amber"),
					option("Low", "rose"),
				],
			},
			{ id: createNotePropertyId(), type: "rating", name: "Energy", value: null },
		],
	},
	{
		id: "idea",
		name: "Idea",
		description: "Capture and triage a raw idea.",
		tags: ["draft", "idea"],
		build: () => [
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Status",
				value: null,
				options: [
					option("Draft", "gray"),
					option("Exploring", "blue"),
					option("Shipped", "green"),
				],
			},
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Category",
				value: null,
				options: [
					option("Product", "teal"),
					option("Writing", "amber"),
					option("Personal", "rose"),
				],
			},
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Priority",
				value: null,
				options: [option("Low", "gray"), option("Medium", "amber"), option("High", "red")],
			},
			{
				id: createNotePropertyId(),
				type: "multi-select",
				name: "Tags",
				value: [],
				options: [],
			},
		],
	},
	{
		id: "reading",
		name: "Reading",
		description: "A source with author, link and rating.",
		tags: ["reading"],
		build: () => [
			{ id: createNotePropertyId(), type: "text", name: "Author", value: "" },
			{ id: createNotePropertyId(), type: "url", name: "Source", value: "" },
			{ id: createNotePropertyId(), type: "rating", name: "Rating", value: null },
			{
				id: createNotePropertyId(),
				type: "select",
				name: "Status",
				value: null,
				options: [
					option("To read", "gray"),
					option("Reading", "amber"),
					option("Read", "green"),
				],
			},
		],
	},
];

function coercePropertyValue(type: NotePropertyType, value: unknown): NotePropertyValue {
	if (value === null || value === undefined) return emptyNotePropertyValue(type);
	switch (type) {
		case "checkbox":
			return Boolean(value);
		case "number": {
			const next = typeof value === "number" ? value : Number(value);
			return Number.isFinite(next) ? next : null;
		}
		case "rating": {
			const next = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(next)) return null;
			return Math.min(5, Math.max(0, Math.round(next)));
		}
		case "multi-select":
		case "person":
			return Array.isArray(value)
				? value.filter((entry): entry is string => typeof entry === "string")
				: [];
		default:
			return typeof value === "string" ? value : String(value);
	}
}

function normalizePropertyOptions(options: unknown): NotePropertyOption[] | undefined {
	if (!Array.isArray(options)) return undefined;
	const normalized = options.flatMap((optionValue) => {
		if (!optionValue || typeof optionValue !== "object") return [];
		const optionRecord = optionValue as Record<string, unknown>;
		const id = typeof optionRecord.id === "string" ? optionRecord.id.trim() : "";
		const label = typeof optionRecord.label === "string" ? optionRecord.label.trim() : "";
		const rawColor = typeof optionRecord.color === "string" ? optionRecord.color : "";
		if (!id || !label || !PROPERTY_COLOR_SET.has(rawColor)) return [];
		return [{ id, label, color: rawColor as NotePropertyColor }];
	});
	return normalized.length > 0 ? normalized : undefined;
}

export function normalizeNoteProperties(input: unknown): NoteProperty[] {
	if (!Array.isArray(input)) return [];
	return input.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		if (
			typeof record.type !== "string" ||
			!PROPERTY_TYPE_SET.has(record.type as NotePropertyType)
		) {
			return [];
		}
		const type = record.type as NotePropertyType;
		const id =
			typeof record.id === "string" && record.id.trim()
				? record.id.trim()
				: createNotePropertyId();
		const name =
			typeof record.name === "string" && record.name.trim()
				? record.name.trim().slice(0, 80)
				: "Untitled";
		const options = normalizePropertyOptions(record.options);
		return [
			{
				id,
				type,
				name,
				value: coercePropertyValue(type, record.value),
				...(options ? { options } : {}),
			},
		];
	});
}

export function applyNotePropertyTemplate(
	templateId: string,
	existingProperties: NoteProperty[] = [],
): NoteProperty[] {
	const template = NOTE_PROPERTY_TEMPLATES.find((candidate) => candidate.id === templateId);
	if (!template) return normalizeNoteProperties(existingProperties);
	return normalizeNoteProperties([...existingProperties, ...template.build()]);
}

const TEMPLATE_NAME_MAX = 60;

export function createCustomNotePropertyTemplate(
	name: string,
	properties: NoteProperty[],
): CustomNotePropertyTemplate {
	return {
		id: createNotePropertyId("tpl"),
		name: name.trim().slice(0, TEMPLATE_NAME_MAX) || "Untitled template",
		properties: normalizeNoteProperties(properties),
	};
}

export function instantiateCustomNotePropertyTemplate(
	template: CustomNotePropertyTemplate,
): NoteProperty[] {
	return normalizeNoteProperties(
		template.properties.map((property) => ({ ...property, id: createNotePropertyId() })),
	);
}

export function normalizeCustomNotePropertyTemplates(input: unknown): CustomNotePropertyTemplate[] {
	if (!Array.isArray(input)) return [];
	return input.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const id =
			typeof record.id === "string" && record.id.trim()
				? record.id.trim()
				: createNotePropertyId("tpl");
		const name =
			typeof record.name === "string" && record.name.trim()
				? record.name.trim().slice(0, TEMPLATE_NAME_MAX)
				: "Untitled template";
		return [{ id, name, properties: normalizeNoteProperties(record.properties) }];
	});
}

export function changeNotePropertyType(
	property: NoteProperty,
	type: NotePropertyType,
): NoteProperty {
	if (property.type === type) return property;
	const keepsOptions = type === "select" || type === "multi-select" || type === "person";
	return {
		id: property.id,
		type,
		name: property.name,
		value: emptyNotePropertyValue(type),
		...(keepsOptions ? { options: property.options ?? [] } : {}),
	};
}
