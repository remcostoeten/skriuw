import { ImportPreviewHost } from "./dialogs/preview-host";
import { ImportProgressHost } from "./dialogs/progress-host";
import { RemoteImagePromptHost } from "./dialogs/remote-images-host";
import { TransferReportHost } from "./dialogs/report-host";

export function TransferDialogs() {
  return (
    <>
      <TransferReportHost />
      <ImportPreviewHost />
      <RemoteImagePromptHost />
      <ImportProgressHost />
    </>
  );
}
