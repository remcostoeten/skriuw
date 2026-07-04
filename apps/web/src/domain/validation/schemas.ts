import { z } from "zod";

const uuidSchema = z.string().uuid();

const notePropertyColorSchema = z.enum([
	"gray",
	"stone",
	"amber",
	"green",
	"blue",
	"teal",
	"rose",
	"red",
]);

const notePropertySchema = z.object({
	id: z.string().trim().min(1).max(128),
	type: z.enum([
		"text",
		"number",
		"date",
		"select",
		"multi-select",
		"person",
		"url",
		"checkbox",
		"rating",
		"location",
		"email",
		"phone",
	]),
	name: z.string().trim().min(1).max(80),
	value: z.union([
		z.string().max(2_000),
		z.number().finite(),
		z.boolean(),
		z.array(z.string().max(128)).max(64),
		z.null(),
	]),
	options: z
		.array(
			z.object({
				id: z.string().trim().min(1).max(128),
				label: z.string().trim().min(1).max(80),
				color: notePropertyColorSchema,
			}),
		)
		.max(64)
		.optional(),
});

const notePropertiesSchema = z.array(notePropertySchema).max(64);

export const createNoteInputSchema = z.object({
	id: uuidSchema.optional(),
	name: z.string().trim().min(1).max(255),
	content: z.string().max(500_000),
	richContent: z.unknown().optional(),
	preferredEditorMode: z.enum(["raw", "block"]).optional(),
	parentId: uuidSchema.nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	tags: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
	properties: notePropertiesSchema.optional(),
	icon: z.string().max(32).optional(),
});

export const updateNoteInputSchema = z
	.object({
		id: uuidSchema,
		name: z.string().trim().min(1).max(255).optional(),
		content: z.string().max(500_000).optional(),
		richContent: z.unknown().optional(),
		preferredEditorMode: z.enum(["raw", "block"]).optional(),
		parentId: uuidSchema.nullable().optional(),
		sortOrder: z.number().int().min(0).optional(),
		tags: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
		properties: notePropertiesSchema.optional(),
		icon: z.string().max(32).optional(),
		createCheckpoint: z.boolean().optional(),
		sessionVersionId: uuidSchema.nullable().optional(),
		// When false, the save must not auto-rename the note from its first
		// heading. Autosaves set this so the filename only follows the heading once
		// the editor commits it (the user leaves the heading block).
		trackHeading: z.boolean().optional(),
	})
	.refine(
		(input) =>
			input.name !== undefined ||
			input.content !== undefined ||
			input.richContent !== undefined ||
			input.preferredEditorMode !== undefined ||
			input.parentId !== undefined ||
			input.sortOrder !== undefined ||
			input.tags !== undefined ||
			input.properties !== undefined ||
			input.icon !== undefined ||
			input.createCheckpoint !== undefined ||
			input.sessionVersionId !== undefined,
		{ message: "At least one field must be provided." },
	);

export const createFolderInputSchema = z.object({
	id: uuidSchema.optional(),
	name: z.string().trim().min(1).max(255),
	parentId: uuidSchema.nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
});

export const updateFolderInputSchema = z
	.object({
		id: uuidSchema,
		name: z.string().trim().min(1).max(255).optional(),
		parentId: uuidSchema.nullable().optional(),
		sortOrder: z.number().int().min(0).optional(),
	})
	.refine(
		(input) =>
			input.name !== undefined ||
			input.parentId !== undefined ||
			input.sortOrder !== undefined,
		{ message: "At least one field must be provided." },
	);

export const publishNoteInputSchema = z.object({
	noteId: uuidSchema,
	viewOnce: z.boolean(),
	expiry: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("never") }),
		z.object({
			kind: z.literal("duration"),
			ms: z
				.number()
				.int()
				.positive()
				.max(365 * 24 * 60 * 60 * 1000),
		}),
		z.object({ kind: z.literal("date"), iso: z.string().datetime() }),
	]),
	password: z.string().min(1).max(128).nullable().optional(),
	showAuthor: z.boolean().optional(),
});

export const updateShareInputSchema = z.object({
	noteId: uuidSchema,
	viewOnce: z.boolean().optional(),
	expiry: z
		.discriminatedUnion("kind", [
			z.object({ kind: z.literal("never") }),
			z.object({
				kind: z.literal("duration"),
				ms: z
					.number()
					.int()
					.positive()
					.max(365 * 24 * 60 * 60 * 1000),
			}),
			z.object({ kind: z.literal("date"), iso: z.string().datetime() }),
		])
		.optional(),
	password: z.string().min(1).max(128).nullable().optional(),
	showAuthor: z.boolean().optional(),
});

export function parseServerInput<T>(schema: z.ZodType<T>, input: unknown): T {
	return schema.parse(input);
}
