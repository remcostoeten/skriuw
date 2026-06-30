import type { NotePropertyColor } from "@/domain/notes/properties";

export type Person = {
	id: string;
	name: string;
	color: NotePropertyColor | null;
};
