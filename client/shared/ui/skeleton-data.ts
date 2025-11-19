import type { Block } from "@blocknote/core";
import type { Note, Item } from "@/features/notes";

// Skeleton BlockNote content with proper types
export const SKELETON_BLOCKS: Block[] = [
  {
    id: "skeleton-title",
    type: "heading",
    props: {
      level: 1,
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [{ type: "text", text: "", styles: {} }],
    children: [],
  },
  {
    id: "skeleton-paragraph-1",
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [
      { type: "text", text: "", styles: {} },
      { type: "text", text: "", styles: {} },
      { type: "text", text: "", styles: {} },
    ],
    children: [],
  },
  {
    id: "skeleton-paragraph-2",
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [
      { type: "text", text: "", styles: {} },
      { type: "text", text: "", styles: {} },
    ],
    children: [],
  },
  {
    id: "skeleton-paragraph-3",
    type: "paragraph",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
    },
    content: [
      { type: "text", text: "", styles: {} },
    ],
    children: [],
  },
];

// Skeleton note with proper types
export const SKELETON_NOTE: Note = {
  id: "skeleton",
  name: "Loading...",
  content: SKELETON_BLOCKS,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  type: 'note',
};

// Skeleton sidebar items with proper types
export const SKELETON_ITEMS: Item[] = [
  {
    id: "skeleton-folder-1",
    name: "Documents",
    type: "folder",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    children: [
      {
        id: "skeleton-note-1",
        name: "Welcome Note",
        type: "note",
        content: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "skeleton-note-2",
        name: "Getting Started",
        type: "note",
        content: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  },
  {
    id: "skeleton-folder-2",
    name: "Projects",
    type: "folder",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    children: [
      {
        id: "skeleton-note-3",
        name: "Project Ideas",
        type: "note",
        content: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  },
  {
    id: "skeleton-folder-3",
    name: "Archive",
    type: "folder",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    children: [],
  },
  {
    id: "skeleton-note-4",
    name: "Quick Notes",
    type: "note",
    content: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];