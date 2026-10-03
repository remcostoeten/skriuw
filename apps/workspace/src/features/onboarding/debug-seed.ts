import { commitOperations } from "@/store/commit";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { contentOperations, creationOperations } from "./debug/operations";

const QUERY_KEY = "seed";
const RELATIONSHIPS_VALUE = "relationships";

/**
 * Development-only workspace fixture for the relationship surfaces, which need
 * cross-linked notes plus shared tags, people, and journal entries — a shape no
 * starter note or importable vault produces, because nothing outside the editor
 * can create a person.
 *
 * The archive notes exist to push "Editor rewrite" past both bounds the panel
 * enforces: more rows than a section shows at once, and more neighbours than
 * the local graph draws, so "Show all" and the hidden-relationship count are
 * both reachable without hand-building a workspace.
 *
 * Run it with `?seed=relationships` in the browser build. Every record carries a
 * fixed `dev-seed-` id, so re-running adds only what is missing and the whole
 * fixture is removable by trashing the "Relationship demo" folder. Release
 * builds tree-shake this to a no-op.
 */
export async function seedRelationshipFixture(store: RendererStore): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (new URLSearchParams(window.location.search).get(QUERY_KEY) !== RELATIONSHIPS_VALUE) {
    return;
  }
  const at = Date.now();
  const creations = creationOperations(store, at);
  if (creations.length > 0) {
    await commitOperations(store, creations);
  }
  const bodies = contentOperations(store, at);
  if (bodies.length > 0) {
    await commitOperations(store, bodies);
  }
}
