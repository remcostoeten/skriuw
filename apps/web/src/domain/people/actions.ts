"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { NotePropertyColor } from "@/domain/notes/properties";
import { parseServerInput } from "@/domain/validation/schemas";
import type { Person } from "./models";
import {
	type CreatePersonInput,
	type UpdatePersonInput,
	createPersonInputSchema,
	updatePersonInputSchema,
} from "./validation";

type PersonRow = { id: string; name: string; color: string | null };

function toPerson(row: PersonRow): Person {
	return {
		id: row.id,
		name: row.name,
		color: (row.color as NotePropertyColor | null) ?? null,
	};
}

const personSelect = { id: true, name: true, color: true } as const;

export async function listPeople(): Promise<Person[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const rows = await prisma.person.findMany({
		where: { userId: user.id },
		orderBy: { name: "asc" },
		select: personSelect,
	});
	return rows.map(toPerson);
}

// Reuse-by-name: creating a person whose name already exists returns the
// existing row instead of failing the @@unique([userId, name]) constraint, so
// the same "$mention" / property pick always resolves to one durable record.
export async function createPerson(input: CreatePersonInput): Promise<Person> {
	const validated = parseServerInput(createPersonInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const row = await prisma.person.upsert({
		where: { userId_name: { userId: user.id, name: validated.name } },
		update: {},
		create: {
			id: validated.id,
			userId: user.id,
			name: validated.name,
			color: validated.color ?? null,
		},
		select: personSelect,
	});
	return toPerson(row);
}

export async function updatePerson(input: UpdatePersonInput): Promise<Person> {
	const validated = parseServerInput(updatePersonInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();
	const row = await prisma.person.update({
		where: { id: validated.id, userId: user.id },
		data: {
			...(validated.name !== undefined ? { name: validated.name } : {}),
			...(validated.color !== undefined ? { color: validated.color } : {}),
		},
		select: personSelect,
	});
	return toPerson(row);
}

export async function deletePerson(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.person.deleteMany({ where: { id, userId: user.id } });
}
