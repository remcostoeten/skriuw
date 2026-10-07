import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import {
  registerOpenedFileConflictListener,
  type OpenedFileConflictChoice,
  type OpenedFileConflictRequest,
} from "./opened-file-conflict-controller";

export function OpenedFileConflictHost() {
  const [request, setRequest] = useState<OpenedFileConflictRequest | null>(null);
  const requestRef = useRef<OpenedFileConflictRequest | null>(null);

  useEffect(() => {
    const unregister = registerOpenedFileConflictListener((next) => {
      requestRef.current = next;
      setRequest(next);
    });
    return () => {
      unregister();
      requestRef.current = null;
    };
  }, []);

  if (!request) {
    return null;
  }

  function finish(choice: OpenedFileConflictChoice | null): void {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(choice);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          finish(null);
        }
      }}
      title="File and note both changed"
      className="w-[min(460px,calc(100vw-24px))]"
    >
      <div className="grid gap-3 px-4 py-3.5 text-[13px] text-muted-foreground">
        <p className="m-0">
          The note <span className="text-foreground">{request.noteTitle}</span> and the file it was
          opened from were both edited since they last matched.
        </p>
        <p
          className="m-0 break-all rounded-md border border-border bg-background/60 px-2.5 py-2 font-mono text-[11px]"
          title={request.filePath}
        >
          {request.filePath}
        </p>
        <p className="m-0 text-[12px]">
          Use file replaces the note body with the file. Keep both opens the file as a new note and
          leaves this one as it is.
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={() => finish("note")}>Keep note</Button>
          <Button onClick={() => finish("both")}>Keep both</Button>
          <Button variant="primary" onClick={() => finish("file")}>
            Use file
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
