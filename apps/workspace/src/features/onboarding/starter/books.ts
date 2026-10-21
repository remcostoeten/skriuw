import type {
  NoteProperty,
  NotePropertyColor,
  NotePropertyOption,
  WorkspaceOperation,
  WorkspaceSettings,
} from "@skriuw/renderer-core/contracts/workspace";
import { propertyColumnKey } from "@skriuw/renderer-core/database/columns";
import { defaultDatabaseView, withDatabaseView } from "@skriuw/renderer-core/database/config";

export const BOOKS_FOLDER = "Books";

type Status = "To read" | "Reading" | "Finished";
type Genre = "Design" | "Systems" | "Writing" | "Software";

type Book = {
  path: string;
  author: string;
  status: Status;
  genres: readonly Genre[];
  rating: number | null;
};

const STATUSES: readonly [Status, NotePropertyColor][] = [
  ["To read", "gray"],
  ["Reading", "blue"],
  ["Finished", "green"],
];

const GENRES: readonly [Genre, NotePropertyColor][] = [
  ["Design", "amber"],
  ["Systems", "teal"],
  ["Writing", "rose"],
  ["Software", "stone"],
];

const BOOKS: readonly Book[] = [
  {
    path: "Books/Thinking in Systems.md",
    author: "Donella Meadows",
    status: "Reading",
    genres: ["Systems"],
    rating: null,
  },
  {
    path: "Books/The Timeless Way of Building.md",
    author: "Christopher Alexander",
    status: "Reading",
    genres: ["Design"],
    rating: null,
  },
  {
    path: "Books/A Pattern Language.md",
    author: "Christopher Alexander",
    status: "To read",
    genres: ["Design", "Systems"],
    rating: null,
  },
  {
    path: "Books/The Design of Everyday Things.md",
    author: "Don Norman",
    status: "Finished",
    genres: ["Design"],
    rating: 5,
  },
  {
    path: "Books/How to Take Smart Notes.md",
    author: "Sönke Ahrens",
    status: "Finished",
    genres: ["Writing"],
    rating: 4,
  },
  {
    path: "Books/Shape Up.md",
    author: "Ryan Singer",
    status: "To read",
    genres: ["Software"],
    rating: null,
  },
];

type PlannedNote = { id: string; relativePath: string };

function optionsOf<Label extends string>(
  entries: readonly [Label, NotePropertyColor][],
  makeId: () => string,
): Map<Label, NotePropertyOption> {
  return new Map(entries.map(([label, color]) => [label, { id: makeId(), label, color }]));
}

function bookProperties(noteId: string, book: Book, makeId: () => string): NoteProperty[] {
  const statuses = optionsOf(STATUSES, makeId);
  const genres = optionsOf(GENRES, makeId);
  return [
    {
      noteId,
      id: makeId(),
      name: "Status",
      value: { valueVersion: 1, type: "select", value: statuses.get(book.status)?.id ?? null },
      options: [...statuses.values()],
      position: 0,
    },
    {
      noteId,
      id: makeId(),
      name: "Author",
      value: { valueVersion: 1, type: "text", value: book.author },
      options: [],
      position: 1,
    },
    {
      noteId,
      id: makeId(),
      name: "Genre",
      value: {
        valueVersion: 1,
        type: "multi-select",
        value: book.genres.flatMap((genre) => genres.get(genre)?.id ?? []),
      },
      options: [...genres.values()],
      position: 2,
    },
    {
      noteId,
      id: makeId(),
      name: "Rating",
      value: { valueVersion: 1, type: "rating", value: book.rating },
      options: [],
      position: 3,
    },
  ];
}

/**
 * @name starterBookOperations
 * @description Gives the starter book notes the properties their database view shows.
 * @example
 * const operations = starterBookOperations(plan.notes, Date.now(), () => crypto.randomUUID());
 */
export function starterBookOperations(
  notes: readonly PlannedNote[],
  at: number,
  makeId: () => string,
): WorkspaceOperation[] {
  const idByPath = new Map(notes.map((note) => [note.relativePath, note.id]));
  return BOOKS.flatMap((book) => {
    const noteId = idByPath.get(book.path);
    if (noteId === undefined) return [];
    return bookProperties(noteId, book, makeId).map((property): WorkspaceOperation => ({
      type: "set_note_property",
      property,
      at,
    }));
  });
}

/**
 * @name withBooksBoard
 * @description Opens the starter Books folder as a board grouped by status.
 * @example
 * const settings = withBooksBoard(current, booksFolderId, Date.now());
 */
export function withBooksBoard(
  settings: WorkspaceSettings,
  folderId: string,
  at: number,
): WorkspaceSettings {
  return withDatabaseView(
    settings,
    folderId,
    {
      ...defaultDatabaseView(folderId),
      layout: "board",
      groupBy: propertyColumnKey("Status"),
      updatedAt: at,
    },
    (id) => id === folderId,
  );
}
