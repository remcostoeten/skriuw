import type { MediaMetadata } from "@/contracts/workspace";
import {
  clampMediaText,
  MEDIA_ALT_MAX_BYTES,
  MEDIA_NAME_MAX_BYTES,
} from "@/features/settings/media-library-model";
import type { RendererStore } from "@/store/types";
import { commitOperations } from "./workspace";

/**
 * Records the librarian fields for one stored file. Blank name and alt clear
 * the record, so a rename can always be undone by emptying the field.
 */
export function setMediaMetadata(
  store: RendererStore,
  contentHash: string,
  fields: { name: string; alt: string },
): Promise<void> {
  const metadata: MediaMetadata = {
    contentHash,
    name: clampMediaText(fields.name, MEDIA_NAME_MAX_BYTES),
    alt: clampMediaText(fields.alt, MEDIA_ALT_MAX_BYTES),
    updatedAt: Date.now(),
  };
  return commitOperations(store, [{ type: "set_media_metadata", metadata }]);
}
