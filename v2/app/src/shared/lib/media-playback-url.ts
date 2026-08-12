import { convertFileSrc } from "@tauri-apps/api/core";
import { noteMediaPath, readNoteImageBlob } from "@/bridge/commands";
import { browserMediaFile } from "@/bridge/browser-media";
import { isBrowserRuntime } from "@/bridge/runtime";
import { resolveImageBlobUrl } from "./image-blob-url";

const playbackUrlByHash = new Map<string, Promise<string>>();

/**
 * Resolves a stored blob to a URL the media element can play: an OPFS
 * file-backed object URL in the browser, a data URL on Linux desktop, and
 * the asset protocol elsewhere. Falls back to the full-read blob URL so
 * playback degrades to the image path instead of breaking.
 */
export function resolveMediaPlaybackUrl(
  contentHash: string,
  mimeType: string,
): Promise<string> {
  const cached = playbackUrlByHash.get(contentHash);
  if (cached) {
    return cached;
  }
  const pending = resolvePlaybackUrl(contentHash, mimeType).catch(() => {
    playbackUrlByHash.delete(contentHash);
    return resolveImageBlobUrl(contentHash, mimeType);
  });
  playbackUrlByHash.set(contentHash, pending);
  return pending;
}

async function resolvePlaybackUrl(
  contentHash: string,
  mimeType: string,
): Promise<string> {
  if (isBrowserRuntime()) {
    const file = await browserMediaFile(contentHash, mimeType);
    return URL.createObjectURL(file);
  }
  // WebKitGTK hands media fetches to GStreamer, which resolves only http(s)
  // and data URLs itself: Tauri asset-protocol sources fail instantly with
  // MEDIA_ERR_SRC_NOT_SUPPORTED even though fetch() of the same URL returns
  // 206, and blob URLs stalled or errored on ~half of multi-megabyte loads
  // (measured on WebKitGTK 2.52 with 1–4 MB MP4s). A data URL was the only
  // transport that played reliably, so Linux pays the base64 copy instead of
  // streaming. WKWebView and WebView2 stream custom schemes correctly and
  // keep the asset protocol.
  if (navigator.userAgent.includes("Linux")) {
    const buffer = await readNoteImageBlob(contentHash, mimeType);
    return encodeDataUrl(buffer, mimeType);
  }
  const path = await noteMediaPath(contentHash, mimeType);
  return convertFileSrc(path);
}

function encodeDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("media data URL encoding failed"));
    reader.readAsDataURL(new Blob([buffer], { type: mimeType }));
  });
}
