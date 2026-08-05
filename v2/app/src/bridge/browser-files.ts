const OBJECT_URL_LIFETIME_MS = 30_000;

type SavedTextFile = {
  fileName: string;
  text: string;
};

type PickedTextFile = {
  name: string;
  text: string;
};

let lastSaved: SavedTextFile | null = null;
let pickedFile: PickedTextFile | null = null;

/**
 * Saves text as a user-visible browser download and records it so tests can
 * observe the exact bytes that left the workspace.
 */
export function saveTextFile(fileName: string, text: string): void {
  lastSaved = { fileName, text };
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}

/** Returns the most recent file handed to `saveTextFile`, if any. */
export function lastSavedTextFile(): SavedTextFile | null {
  return lastSaved;
}

/**
 * Opens the browser file chooser, reads the chosen file as text, and returns
 * its display name after registering the content for a follow-up command.
 * Resolves to null when the user cancels.
 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then((text) => resolve(rememberPickedFile(file.name, text)), reject);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Registers picked file content under its display name so a later command can
 * consume it without a filesystem path. Only the latest pick is retained.
 */
export function rememberPickedFile(name: string, text: string): string {
  pickedFile = { name, text };
  return name;
}

/** Returns the registered pick matching `name`, or null when it is stale. */
export function readPickedFile(name: string): PickedTextFile | null {
  if (pickedFile === null || pickedFile.name !== name) {
    return null;
  }
  return pickedFile;
}
