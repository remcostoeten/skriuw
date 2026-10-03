import { openUrl } from "@tauri-apps/plugin-opener";
import { invokeDesktop } from "./invoke";

/** Hands the URL to the operating system's default browser. */
export function openInSystemBrowser(url: string): Promise<void> {
  return openUrl(url);
}

/** Opens the URL in the desktop shell's shared link window. */
export function openInLinkWindow(url: string): Promise<void> {
  return invokeDesktop<void>("open_link_window", { url });
}
