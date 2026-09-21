import { type Directory, File, Paths } from "expo-file-system";
import { createCaptureInbox, type CaptureInbox, type InboxFile } from "./inbox";

/**
 * The App Group the iOS share extension and the application share. The same
 * identifier appears in `share-extension/ios/Skriuw.entitlements`; they are
 * the two halves of one contract and have to be changed together.
 */
export const CAPTURE_APP_GROUP = "group.dev.skriuw.app";

export const CAPTURE_INBOX_FILE_NAME = "skriuw-capture-inbox.jsonl";

/**
 * Where both producers agree to leave a capture. On iOS that is the App Group
 * container, because a share extension runs in its own sandbox and cannot see
 * the application's documents; everywhere else it is the document directory,
 * which on Android is the `filesDir` the share activity writes to.
 */
function inboxDirectory(): Directory {
  const shared = Paths.appleSharedContainers[CAPTURE_APP_GROUP];
  return shared ?? Paths.document;
}

function ensured(): File {
  const file = new File(inboxDirectory(), CAPTURE_INBOX_FILE_NAME);
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: false });
  }
  return file;
}

export function createDeviceInboxFile(): InboxFile {
  return {
    readWhole() {
      const file = new File(inboxDirectory(), CAPTURE_INBOX_FILE_NAME);
      return file.exists ? file.textSync() : "";
    },
    appendLine(line) {
      ensured().write(line, { append: true });
    },
    replaceWhole(contents) {
      ensured().write(contents);
    },
  };
}

export function createDeviceCaptureInbox(): CaptureInbox {
  return createCaptureInbox(createDeviceInboxFile());
}
