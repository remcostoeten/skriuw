import type { RefObject } from "react";
import { ImageIcon } from "@/shared/icons/static";
import { pickImageFiles } from "./image-input";

type Props = {
  hostRef: RefObject<HTMLElement | null>;
};

/**
 * Hands picked files to the editor through its own paste handler, which
 * already inserts image and video nodes and persists them in the background.
 * The accessory lives outside the editor and has no `EditorView`, so a
 * synthetic paste on the editor root is the one seam that reaches it.
 */
export function deliverFilesAsPaste(target: HTMLElement, files: readonly File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: transfer });
  target.dispatchEvent(event);
}

/**
 * Thumb-reach "Insert image" button for the compact shell. It floats above the
 * docked formatting bar and follows the software keyboard's top edge, so
 * adding a photo from an open note is one tap plus the system picker.
 */
export function InsertMediaAccessory({ hostRef }: Props) {
  function insert(): void {
    pickImageFiles((files) => {
      const editor = hostRef.current?.querySelector<HTMLElement>(".ProseMirror");
      if (!editor || files.length === 0) return;
      deliverFilesAsPaste(editor, files);
    });
  }

  return (
    <button
      type="button"
      aria-label="Insert image"
      className="fixed right-3 z-40 grid size-11 place-items-center rounded-full border border-border bg-popover text-foreground shadow-md top-[calc(var(--viewport-top,0px)+var(--viewport-height,100dvh)-176px)] [:root[data-keyboard=open]_&]:top-[calc(var(--viewport-top,0px)+var(--viewport-height,100dvh)-112px)] active:scale-95"
      onPointerDown={(event) => event.preventDefault()}
      onClick={insert}
    >
      <ImageIcon size={20} />
    </button>
  );
}
