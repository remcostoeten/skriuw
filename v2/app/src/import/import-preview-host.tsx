import { useEffect, useRef, useState } from "react";
import { Button } from "../shared/ui/button";
import { Dialog } from "../shared/ui/dialog";
import {
  registerImportPreviewListener,
  type ImportPreviewRequest,
} from "./preview-controller";

type ActiveRequest = ImportPreviewRequest & {
  resolve: (sourceId: string | null) => void;
};

export function ImportPreviewHost() {
  const [request, setRequest] = useState<ActiveRequest | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const requestRef = useRef<ActiveRequest | null>(null);

  useEffect(() => {
    const unregister = registerImportPreviewListener((next) => {
        requestRef.current?.resolve(null);
        requestRef.current = next;
        setSelectedSourceId(next.detectedSourceId);
        setRequest(next);
      });
    return () => {
      unregister();
      requestRef.current?.resolve(null);
      requestRef.current = null;
    };
  }, []);

  if (!request) {
    return null;
  }
  const selected =
    request.candidates.find((candidate) => candidate.sourceId === selectedSourceId) ??
    request.candidates[0];
  if (!selected) {
    return null;
  }

  function finish(sourceId: string | null): void {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(sourceId);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          finish(null);
        }
      }}
      title="Preview import"
      className="w-[min(620px,calc(100vw-24px))]"
    >
      <div className="grid gap-4 px-4 py-3.5 text-[12px]">
        <div className="grid grid-cols-[116px_1fr] items-center gap-3">
          <label htmlFor="import-provider" className="text-muted-foreground">
            Format
          </label>
          <select
            id="import-provider"
            className="h-8 rounded-[var(--radius)] border border-border bg-background px-2 text-foreground outline-none focus:border-ring"
            value={selected.sourceId}
            onChange={(event) => setSelectedSourceId(event.target.value)}
          >
            {request.candidates.map((candidate) => (
              <option key={candidate.sourceId} value={candidate.sourceId}>
                {candidate.sourceLabel}
                {candidate.sourceId === request.detectedSourceId ? " — detected" : ""}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">Source</span>
          <span className="truncate font-mono text-[11px]" title={request.sourcePath}>
            {request.sourcePath}
          </span>
        </div>

        <div className="grid grid-cols-5 divide-x divide-border border-y border-border">
          {[
            ["Notes", selected.noteCount],
            ["Folders", selected.folderCount],
            ["Images", selected.localImageCount],
            ["Tags", selected.createdTagCount],
            ["Properties", selected.propertyCount],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-0.5 px-2.5 py-2">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </span>
              <span className="font-mono text-base tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        <section className="grid gap-1.5">
          <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Review
          </h3>
          {selected.warningLines.length > 0 ? (
            <ul className="m-0 grid max-h-40 gap-1 overflow-y-auto border-l-2 border-amber-500/45 py-0.5 pl-3 text-muted-foreground">
              {selected.warningLines.map((line, index) => (
                <li key={`${index}:${line}`} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-muted-foreground">No migration warnings.</p>
          )}
        </section>

        <p className="m-0 text-[11px] text-muted-foreground">
          Imported items join workspace root. Re-import creates another copy.
          Workspace changes commit together.
        </p>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={() => finish(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => finish(selected.sourceId)}>
            Import {selected.noteCount} {selected.noteCount === 1 ? "note" : "notes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
