import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import {
  registerRemoteImagePromptListener,
  type RemoteImageChoice,
  type RemoteImagePromptRequest,
} from "./remote-images-controller";

function splitAddress(source: string): { host: string; path: string } {
  try {
    const url = new URL(source);
    return { host: url.host, path: `${url.pathname}${url.search}` };
  } catch {
    return { host: "", path: source };
  }
}

export function RemoteImagePromptHost() {
  const [request, setRequest] = useState<RemoteImagePromptRequest | null>(null);
  const requestRef = useRef<RemoteImagePromptRequest | null>(null);

  useEffect(() => {
    const unregister = registerRemoteImagePromptListener((next) => {
      requestRef.current?.resolve(null);
      requestRef.current = next;
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

  function finish(choice: RemoteImageChoice | null): void {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(choice);
  }

  const images = request.sources.length === 1 ? "1 image" : `${request.sources.length} images`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          finish(null);
        }
      }}
      title="Download remote images?"
      className="w-[min(460px,calc(100vw-24px))]"
    >
      <div className="grid gap-3 px-4 py-3.5 text-[13px] text-muted-foreground">
        <p className="m-0">
          This import links {images} from the web, such as README badges. Skriuw can download each
          one now and keep a copy in your workspace. Notes never load images from the web when they
          open.
        </p>
        <ul
          aria-label="Images to download"
          className="m-0 grid max-h-44 list-none gap-1 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-2 font-mono text-[11px]"
        >
          {request.sources.map((source) => {
            const { host, path } = splitAddress(source);
            return (
              <li key={source} className="break-all" title={source}>
                <span className="text-foreground">{host}</span>
                {path}
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-[12px]">
          Your choice is saved for future imports. Change it in Settings, Data.
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={() => finish("block")}>Keep blocked</Button>
          <Button variant="primary" onClick={() => finish("download")}>
            Download images
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
