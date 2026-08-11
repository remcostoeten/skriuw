import { Fragment, useEffect, useRef, useState } from "react";
import type { WorkspaceImage } from "@/contracts/workspace";
import { imageFormatLabel } from "@/settings/media-library-model";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { resolveImageBlobUrl } from "@/shared/lib/image-blob-url";
import { Dialog } from "@/shared/ui/dialog";

type RenameDialogProps = {
  initialAlt: string;
  onSubmit: (alt: string) => void;
  onClose: () => void;
};

export function ImageRenameDialog({ initialAlt, onSubmit, onClose }: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit(): void {
    onSubmit(inputRef.current?.value.trim() ?? "");
    onClose();
  }

  return (
    <Dialog open title="Rename image" onOpenChange={(open) => !open && onClose()}>
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          className="rounded-[var(--radius)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring"
          defaultValue={initialAlt}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="cursor-pointer rounded-[var(--radius)] border-none bg-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="cursor-pointer rounded-[var(--radius)] border-none bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

type LightboxProps = {
  image: WorkspaceImage;
  alt: string;
  onClose: () => void;
};

export function ImageLightbox({ image, alt, onClose }: LightboxProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveImageBlobUrl(image.contentHash, image.mimeType).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [image.contentHash, image.mimeType]);

  return (
    <Dialog
      open
      title={alt || "Image"}
      onOpenChange={(open) => !open && onClose()}
      className="w-[min(90vw,900px)] max-h-[88vh]"
    >
      <div className="flex items-center justify-center p-4">
        {src ? (
          <img
            src={src}
            alt={alt}
            className="max-h-[76vh] max-w-full rounded-[var(--radius)] object-contain"
          />
        ) : (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        )}
      </div>
    </Dialog>
  );
}

type InfoDialogProps = {
  image: WorkspaceImage;
  alt: string;
  onClose: () => void;
};

export function ImageInfoDialog({ image, alt, onClose }: InfoDialogProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: alt || "Untitled" },
    { label: "Format", value: imageFormatLabel(image.mimeType) },
    { label: "Size", value: formatByteSize(image.byteSize) },
    ...(image.width && image.height
      ? [{ label: "Dimensions", value: `${image.width} × ${image.height}` }]
      : []),
    { label: "Added", value: new Date(image.createdAt).toLocaleString() },
  ];

  return (
    <Dialog open title="Image info" onOpenChange={(open) => !open && onClose()}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 p-4 text-sm">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-foreground">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </Dialog>
  );
}
