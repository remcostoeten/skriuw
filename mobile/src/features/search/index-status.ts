import type { SearchIndexStatus } from "../../../../shared/renderer-core/src/contracts/workspace";

export type SearchIndexPorts = {
  readStatus: () => Promise<SearchIndexStatus>;
  rebuild: () => Promise<SearchIndexStatus>;
};

export type SearchIndexView =
  | { state: "current"; status: SearchIndexStatus }
  | { state: "rebuilding"; status: SearchIndexStatus }
  | { state: "unavailable"; message: string };

export type SearchIndexReconciliation = {
  rebuilt: boolean;
  view: SearchIndexView;
};

export function describeSearchIndex(view: SearchIndexView): string | null {
  if (view.state === "unavailable") {
    return view.message;
  }
  if (view.state === "current") {
    return null;
  }
  const { indexedNotes, noteCount } = view.status;
  return `Rebuilding search index — ${indexedNotes} of ${noteCount} notes.`;
}

function failureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.length > 0 ? detail : "Search is unavailable in this build.";
}

export async function reconcileSearchIndex(
  ports: SearchIndexPorts,
  publish: (view: SearchIndexView) => void,
): Promise<SearchIndexReconciliation> {
  let status: SearchIndexStatus;
  try {
    status = await ports.readStatus();
  } catch (error) {
    const view: SearchIndexView = { state: "unavailable", message: failureMessage(error) };
    publish(view);
    return { rebuilt: false, view };
  }
  if (!status.needsRebuild) {
    const view: SearchIndexView = { state: "current", status };
    publish(view);
    return { rebuilt: false, view };
  }
  publish({ state: "rebuilding", status });
  try {
    const view: SearchIndexView = { state: "current", status: await ports.rebuild() };
    publish(view);
    return { rebuilt: true, view };
  } catch (error) {
    const view: SearchIndexView = { state: "unavailable", message: failureMessage(error) };
    publish(view);
    return { rebuilt: true, view };
  }
}
