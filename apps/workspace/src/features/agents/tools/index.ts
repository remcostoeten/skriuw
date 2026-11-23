import type { ToolContext } from "../context";
import type { AgentTool } from "../protocol/server";
import { databaseTools } from "./databases";
import { drawingTools } from "./drawings";
import { noteTools } from "./notes";
import { taskTools } from "./tasks";

const referenceTools: readonly AgentTool<ToolContext>[] = [
  {
    name: "list_tags_and_people",
    title: "List tags and people",
    description:
      "Lists the workspace's tags and people by name, for task tags and person properties.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run(_input, context) {
      const state = context.store.getState();
      return {
        tags: [...state.tags.values()].map((tag) => ({ id: tag.id, name: tag.name })),
        people: [...state.people.values()].map((person) => ({ id: person.id, name: person.name })),
      };
    },
  },
];

export const AGENT_TOOLS: readonly AgentTool<ToolContext>[] = [
  ...noteTools,
  ...taskTools,
  ...databaseTools,
  ...drawingTools,
  ...referenceTools,
];

export const AGENT_INSTRUCTIONS = [
  "Skriuw is a local-first notes app. Its workspace is a tree of folders and notes; every id is a string returned by the tools.",
  "Start with list_workspace or search_notes to find things before changing them.",
  "Note bodies are Markdown. A note's title follows its first line, so new notes start with a heading.",
  "Tasks appear in the Tasks view with status todo, in_progress or done. create_task with noteId adds the task as a tracked checklist line in that note; without noteId it stands alone.",
  "For project management with custom lanes, use a database: a folder whose notes are rows and whose note properties are columns. create_database with a select column (for example Status with options Backlog, Doing, Review, Done) and groupBy shows it as a board. Move a card between lanes with set_properties.",
  "Excalidraw drawings are blocks inside notes. list_drawings finds them, read_drawing returns their elements, create_drawing adds one to a note, and update_drawing adds, patches or removes elements by id.",
  "trash_items moves folders and notes to the trash and restore_items brings them back; folders and notes are never deleted permanently through these tools. Locked notes are never readable or writable.",
].join("\n");
