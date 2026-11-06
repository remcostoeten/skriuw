import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { mediaEntryForContentHash, mediaUsageDetail, openMediaUsage } from "./media-usage";
import {
  imageFormatLabel,
  MEDIA_ALT_MAX_BYTES,
  MEDIA_NAME_MAX_BYTES,
  mediaDisplayName,
  type MediaUsage,
} from "./media-library-model";
import { formatByteSize } from "@/shared/format/bytes";
import { resolveImageBlobUrl } from "@/platform/runtime/media-urls";
import type { EditorExtension, ImageDialogsProps } from "@/features/editor/extensions";
import { setMediaMetadata } from "./media-metadata";
import { Dialog } from "@/shared/ui/dialog";
import { MediaLightbox, MediaUsageList, type MediaLightboxUsage } from "./media-lightbox";

type ImageFields = { name: string; alt: string };

const fieldClass =
  "rounded-[var(--radius)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring pointer-coarse:min-h-11 pointer-coarse:text-base";
const secondaryButtonClass =
  "cursor-pointer rounded-[var(--radius)] border-none bg-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:px-4";
const primaryButtonClass =
  "cursor-pointer rounded-[var(--radius)] border-none bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 pointer-coarse:min-h-11 pointer-coarse:px-4";

function toLightboxUsages(
  usages: readonly MediaUsage[],
  onOpen: (usage: MediaUsage) => void,
): MediaLightboxUsage[] {
  return usages.map((usage) => ({
    id: `${usage.noteId}-${usage.surface}-${usage.placement}`,
    title: usage.title,
    detail: mediaUsageDetail(usage),
    onOpen: () => onOpen(usage),
  }));
}

function selectImages(state: RendererState) {
  return state.images;
}

function selectNodes(state: RendererState) {
  return state.nodes;
}

function selectDocuments(state: RendererState) {
  return state.documents;
}

function selectMediaMetadata(state: RendererState) {
  return state.mediaMetadata;
}

function useImageLibraryEntry(store: RendererStore, contentHash: string) {
  const images = useRendererSelector(store, selectImages);
  const nodes = useRendererSelector(store, selectNodes);
  const documents = useRendererSelector(store, selectDocuments);
  const mediaMetadata = useRendererSelector(store, selectMediaMetadata);
  return useMemo(
    () => mediaEntryForContentHash({ images, nodes, documents, mediaMetadata }, contentHash),
    [images, nodes, documents, mediaMetadata, contentHash],
  );
}

type EditDialogProps = {
  initial: ImageFields;
  onSubmit: (fields: ImageFields) => void;
  onClose: () => void;
};

/**
 * Edits the library name of the stored file and the alt text of this image.
 * The name is shared by every note that uses the same file.
 */
function ImageEditDialog({ initial, onSubmit, onClose }: EditDialogProps) {
  const [name, setName] = useState(initial.name);
  const [alt, setAlt] = useState(initial.alt);
  const altRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    altRef.current?.focus();
    altRef.current?.select();
  }, []);

  return (
    <Dialog open title="Edit image" onOpenChange={(open) => !open && onClose()}>
      <ImageFieldsForm
        name={name}
        alt={alt}
        altRef={altRef}
        onNameChange={setName}
        onAltChange={setAlt}
        onCancel={onClose}
        onSubmit={() => {
          onSubmit({ name: name.trim(), alt: alt.trim() });
          onClose();
        }}
      />
    </Dialog>
  );
}

type FieldsFormProps = {
  name: string;
  alt: string;
  altRef?: RefObject<HTMLTextAreaElement | null>;
  onNameChange: (value: string) => void;
  onAltChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel?: string;
};

function ImageFieldsForm({
  name,
  alt,
  altRef,
  onNameChange,
  onAltChange,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: FieldsFormProps) {
  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        File name
        <input
          className={fieldClass}
          value={name}
          maxLength={MEDIA_NAME_MAX_BYTES}
          placeholder="Untitled image"
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Alt text
        <textarea
          ref={altRef}
          className={`${fieldClass} min-h-16 resize-y`}
          value={alt}
          maxLength={MEDIA_ALT_MAX_BYTES}
          placeholder="Describe the image for screen readers"
          onChange={(event) => onAltChange(event.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className={secondaryButtonClass} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={primaryButtonClass}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

type LightboxProps = {
  store: RendererStore;
  image: WorkspaceImage;
  alt: string;
  onClose: () => void;
};

function ImageLightbox({ store, image, alt, onClose }: LightboxProps) {
  const [src, setSrc] = useState<string | null>(null);
  const entry = useImageLibraryEntry(store, image.contentHash);

  useEffect(() => {
    let cancelled = false;
    void resolveImageBlobUrl(image.contentHash, image.mimeType).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [image.contentHash, image.mimeType]);

  if (src === null) return null;
  return (
    <MediaLightbox
      open
      src={src}
      title={entry ? mediaDisplayName(entry) : alt || "Image"}
      alt={alt}
      mimeType={image.mimeType}
      byteSize={image.byteSize}
      contentHash={image.contentHash}
      dimensions={image.width && image.height ? `${image.width} × ${image.height}` : null}
      addedAt={image.createdAt}
      usages={toLightboxUsages(entry?.usages ?? [], (usage) => openMediaUsage(store, usage))}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

type InfoDialogProps = {
  store: RendererStore;
  image: WorkspaceImage;
  alt: string;
  onSave: (fields: ImageFields) => void;
  onClose: () => void;
};

function ImageInfoDialog({ store, image, alt, onSave, onClose }: InfoDialogProps) {
  const entry = useImageLibraryEntry(store, image.contentHash);
  const [name, setName] = useState(entry?.name ?? "");
  const [draftAlt, setDraftAlt] = useState(alt);
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "File name",
      value: mediaDisplayName({ name, mimeType: image.mimeType, contentHash: image.contentHash }),
    },
    { label: "Format", value: `${imageFormatLabel(image.mimeType)} (${image.mimeType})` },
    { label: "Size", value: formatByteSize(image.byteSize) },
    ...(image.width && image.height
      ? [{ label: "Dimensions", value: `${image.width} × ${image.height}` }]
      : []),
    { label: "Added", value: new Date(image.createdAt).toLocaleString() },
  ];

  return (
    <Dialog open title="Image info" onOpenChange={(open) => !open && onClose()}>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 border-b border-border p-4 text-sm">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="m-0 min-w-0 break-words text-foreground">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      <ImageFieldsForm
        name={name}
        alt={draftAlt}
        onNameChange={setName}
        onAltChange={setDraftAlt}
        onSubmit={() => onSave({ name: name.trim(), alt: draftAlt.trim() })}
      />
      <div className="border-t border-border px-2 py-4">
        <MediaUsageList
          usages={toLightboxUsages(entry?.usages ?? [], (usage) => openMediaUsage(store, usage))}
        />
      </div>
    </Dialog>
  );
}

function ImageDialogs({ store, dialog, renameImage, onClose }: ImageDialogsProps) {
  function saveImageFields(imageId: string, image: WorkspaceImage | null, fields: ImageFields) {
    renameImage(imageId, fields.alt);
    if (!image) return;
    const current = store.getState().mediaMetadata.get(image.contentHash);
    if ((current?.name ?? "") === fields.name) return;
    void setMediaMetadata(store, image.contentHash, {
      name: fields.name,
      alt: current?.alt ?? "",
    }).catch((error: unknown) => {
      console.error("Could not rename image", error);
    });
  }

  if (dialog.kind === "rename") {
    return (
      <ImageEditDialog
        initial={{
          name: dialog.image
            ? (store.getState().mediaMetadata.get(dialog.image.contentHash)?.name ?? "")
            : "",
          alt: dialog.alt,
        }}
        onSubmit={(fields) => saveImageFields(dialog.imageId, dialog.image, fields)}
        onClose={onClose}
      />
    );
  }
  if (dialog.kind === "bigger") {
    return <ImageLightbox store={store} image={dialog.image} alt={dialog.alt} onClose={onClose} />;
  }
  return (
    <ImageInfoDialog
      store={store}
      image={dialog.image}
      alt={dialog.alt}
      onSave={(fields) => saveImageFields(dialog.image.id, dialog.image, fields)}
      onClose={onClose}
    />
  );
}

export const mediaEditorExtension: EditorExtension = { ImageDialogs };
