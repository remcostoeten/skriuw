import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import {
  registerImportProgressListener,
  type ImportProgress,
} from "./progress-controller";

type ActiveProgress = ImportProgress & {
  cancel: () => void;
};

const labels: Record<ImportProgress["phase"], string> = {
  reading: "Reading export",
  parsing: "Planning import",
  images: "Importing images",
  committing: "Committing workspace changes",
};

export function ImportProgressHost() {
  const [progress, setProgress] = useState<ActiveProgress | null>(null);

  useEffect(() => registerImportProgressListener(setProgress), []);

  if (!progress) {
    return null;
  }
  const percent =
    progress.total && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : null;
  return (
    <Dialog
      open
      onOpenChange={() => undefined}
      title="Import in progress"
      className="w-[min(440px,calc(100vw-24px))]"
    >
      <div className="grid gap-3 px-4 py-3.5 text-xs">
        <div className="flex items-center justify-between">
          <span>{labels[progress.phase]}</span>
          <span className="font-mono text-muted-foreground">
            {percent === null ? "…" : `${percent}%`}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-sm bg-muted">
          <div
            className="h-full bg-foreground transition-[width] duration-150"
            style={{ width: `${percent ?? 12}%` }}
          />
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!progress.cancellable}
            onClick={progress.cancel}
          >
            {progress.cancellable ? "Cancel" : "Finishing…"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
