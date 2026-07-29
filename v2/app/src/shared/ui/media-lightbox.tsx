import { formatByteSize } from "../lib/format-bytes";
import { Dialog } from "./dialog";

type MediaLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
};

export function MediaLightbox({
  open,
  onOpenChange,
  src,
  mimeType,
  byteSize,
  contentHash,
}: MediaLightboxProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Media preview"
      className="h-dvh max-h-none w-screen max-w-none rounded-none border-0"
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30 p-3">
          <img
            src={src}
            alt=""
            className="block max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-popover px-3.5 py-2 text-xs text-muted-foreground">
          <span>{mimeType}</span>
          <span aria-hidden="true">·</span>
          <span>{formatByteSize(byteSize)}</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate font-mono" title={contentHash}>
            {contentHash}
          </span>
        </footer>
      </div>
    </Dialog>
  );
}
