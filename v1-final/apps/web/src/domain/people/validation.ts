import { z } from "zod";

const personColorSchema = z.enum([
	"gray",
	"stone",
	"amber",
	"green",
	"blue",
	"teal",
	"rose",
	"red",
]);

export const createPersonInputSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1).max(80),
	color: personColorSchema.nullable().optional(),
});

export const updatePersonInputSchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(80).optional(),
	color: personColorSchema.nullable().optional(),
});

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonInputSchema>;
