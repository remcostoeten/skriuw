import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { Select } from "@/shared/ui/select";
import {
  registerImportPreviewListener,
  type ImportPreviewRequest,
  type ImportPreviewSelection,
} from "./preview-controller";
import type { ImportDuplicateMode } from "./plan";
import { cn } from "@/shared/lib/utils";
import { sectionLabelClass } from "@/shared/ui/section-header";

type ActiveRequest = ImportPreviewRequest & {
  resolve: (selection: ImportPreviewSelection | null) => void;
};

export function ImportPreviewHost() {
  const [request, setRequest] = useState<ActiveRequest | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [destinationFolderId, setDestinationFolderId] = useState<string | null>(
    null,
  );
  const [duplicateMode, setDuplicateMode] =
    useState<ImportDuplicateMode>("skip");
  const [recordSource, setRecordSource] = useState(true);
  const [groupIntoSourceFolder, setGroupIntoSourceFolder] = useState(false);
  const [groupByYear, setGroupByYear] = useState(false);
  const requestRef = useRef<ActiveRequest | null>(null);

  useEffect(() => {
    const unregister = registerImportPreviewListener((next) => {
        requestRef.current?.resolve(null);
        requestRef.current = next;
        setSelectedSourceId(next.detectedSourceId);
        setDestinationFolderId(next.initialDestinationFolderId ?? null);
        setDuplicateMode("skip");
        setRecordSource(true);
        setGroupIntoSourceFolder(false);
        setGroupByYear(false);
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
  const selectedSource =
    request.candidates.find((candidate) => candidate.sourceId === selectedSourceId) ??
    request.candidates[0];
  if (!selectedSource) {
    return null;
  }
  const selected = selectedSource.variants[duplicateMode];

  function finish(selection: ImportPreviewSelection | null): void {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(selection);
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
          <span className="text-muted-foreground">Format</span>
          <Select
            label="Format"
            align="start"
            className="w-full"
            triggerClassName="h-8 w-full justify-between bg-background hover:bg-muted/40"
            value={selected.sourceId}
            onChange={setSelectedSourceId}
            options={request.candidates.map((candidate) => ({
              value: candidate.sourceId,
              label:
                candidate.sourceId === request.detectedSourceId
                  ? `${candidate.sourceLabel} - detected`
                  : candidate.sourceLabel,
            }))}
          />
          <span className="text-muted-foreground">Destination</span>
          <Select
            label="Destination"
            align="start"
            className="w-full"
            triggerClassName="h-8 w-full justify-between bg-background hover:bg-muted/40"
            value={destinationFolderId ?? ""}
            onChange={(next) => setDestinationFolderId(next || null)}
            options={request.destinations.map((destination) => ({
              value: destination.id ?? "",
              label: destination.label,
            }))}
          />
          <span className="text-muted-foreground">Re-import</span>
          <Select
            label="Re-import"
            align="start"
            className="w-full"
            triggerClassName="h-8 w-full justify-between bg-background hover:bg-muted/40"
            value={duplicateMode}
            onChange={setDuplicateMode}
            options={[
              { value: "skip", label: "Skip previous imports" },
              { value: "update", label: "Update previous imports" },
              { value: "copy", label: "Create copies" },
            ]}
          />
          <span className="text-muted-foreground">Organize</span>
          <div className="grid gap-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                name="import-group-source-folder"
                checked={groupIntoSourceFolder}
                onChange={(event) => setGroupIntoSourceFolder(event.target.checked)}
                className="size-3.5 cursor-pointer accent-[var(--primary)]"
              />
              <span>Place everything in a "{selectedSource.sourceLabel}" folder</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                name="import-group-by-year"
                checked={groupByYear}
                onChange={(event) => setGroupByYear(event.target.checked)}
                className="size-3.5 cursor-pointer accent-[var(--primary)]"
              />
              <span>Group notes into folders by year created</span>
            </label>
          </div>
          <span className="text-muted-foreground">Provenance</span>
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              name="import-record-source"
              checked={recordSource}
              onChange={(event) => setRecordSource(event.target.checked)}
              className="size-3.5 cursor-pointer accent-[var(--primary)]"
            />
            <span>
              Record the import source as a property on
              {" "}
              {selected.sourcePropertyNoteCount === 1
                ? "1 new note"
                : `${selected.sourcePropertyNoteCount} new notes`}
            </span>
          </label>
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
              <span className={sectionLabelClass}>
                {label}
              </span>
              <span className="font-mono text-base tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        <section className="grid gap-1.5">
          <h3 className={cn("m-0", sectionLabelClass)}>
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
          Destination and re-import choices are included in this preview.
          Workspace changes and durable receipts commit together.
        </p>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={() => finish(null)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              finish({
                sourceId: selected.sourceId,
                destinationFolderId,
                duplicateMode,
                recordSource,
                groupIntoSourceFolder,
                groupByYear,
              })
            }
          >
            Import {selected.noteCount} {selected.noteCount === 1 ? "note" : "notes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
