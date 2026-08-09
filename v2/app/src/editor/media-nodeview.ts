import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { resolveImageBlobUrl } from "../shared/lib/image-blob-url";
import { resolveMediaPlaybackUrl } from "../shared/lib/media-playback-url";
import type { RendererStore } from "../store/types";
import { isMediaKind, mediaTitleFromSource, type MediaKind } from "./schema";

export type MediaOpenHandler = (src: string) => void;

export type MediaUploadHandler = (file: File, assignedId: string) => void;

type VideoPlayerElement = HTMLDivElement & { disposePlayer: () => void };

const videoControlIcons = {
  play: '<svg viewBox="0 0 24 24" focusable="false"><path d="m8 5 11 7-11 7V5Z" fill="currentColor" /></svg>',
  pause: '<svg viewBox="0 0 24 24" focusable="false"><path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" /></svg>',
  volume: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
  muted: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 4 4m0-4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
  loop: '<svg viewBox="0 0 24 24" focusable="false"><path d="M17 3.5 20.5 7 17 10.5M4 7h16M7 20.5 3.5 17 7 13.5m13 3.5H4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
  popOut: '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 5H5v14h14v-4m-7-10h7v7m0-7-9 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
  returnToNote: '<svg viewBox="0 0 24 24" focusable="false"><path d="M15 5h4v14H5v-4m7-10H5v7m0-7 9 9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>',
} as const;

const placeholders: Record<MediaKind, string> = {
  video: "Paste a video URL",
  audio: "Paste an audio URL",
  file: "Paste a file URL",
};

function normalizeSource(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function createControlButton(label: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-video-control";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
  return button;
}

function createVideoPlayer(
  src: string,
  onFailure?: () => void,
): VideoPlayerElement {
  const player = document.createElement("div") as VideoPlayerElement;
  const lifecycle = new AbortController();
  player.className = "note-video-player";
  player.dataset.pip = "false";

  const video = document.createElement("video");
  video.className = "note-media note-video-media";
  video.preload = "auto";
  video.playsInline = true;
  video.src = src;
  player.disposePlayer = () => {
    lifecycle.abort();
    video.pause();
  };
  player.append(video);

  const centerPlay = createControlButton("Play video", videoControlIcons.play);
  centerPlay.classList.add("note-video-center-play");
  player.append(centerPlay);

  const controls = document.createElement("div");
  controls.className = "note-video-controls";
  controls.setAttribute("aria-label", "Video controls");

  const play = createControlButton("Play video", videoControlIcons.play);
  const time = document.createElement("output");
  time.className = "note-video-time";
  time.setAttribute("aria-label", "Playback time");
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "note-video-seek";
  seek.min = "0";
  seek.max = "0";
  seek.step = "0.1";
  seek.value = "0";
  seek.setAttribute("aria-label", "Playback position");

  const volume = document.createElement("div");
  volume.className = "note-video-volume";
  const mute = createControlButton("Mute video", videoControlIcons.volume);
  const volumeInput = document.createElement("input");
  volumeInput.type = "range";
  volumeInput.className = "note-video-volume-input";
  volumeInput.min = "0";
  volumeInput.max = "1";
  volumeInput.step = "0.01";
  volumeInput.value = String(video.volume);
  volumeInput.setAttribute("aria-label", "Volume");
  volume.append(mute, volumeInput);
  let lastAudibleVolume = video.volume || 0.5;

  const loop = createControlButton("Turn loop on", videoControlIcons.loop);
  loop.setAttribute("aria-pressed", String(video.loop));
  const pip = createControlButton("Keep video playing in Skriuw", videoControlIcons.popOut);
  const fullscreen = createControlButton("Enter fullscreen", videoControlIcons.fullscreen);
  controls.append(play, time, seek, volume, loop, pip, fullscreen);
  player.append(controls);

  function togglePlayback(): void {
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function updatePlaybackState(): void {
    const isPlaying = !video.paused && !video.ended;
    const label = isPlaying ? "Pause video" : "Play video";
    play.setAttribute("aria-label", label);
    centerPlay.setAttribute("aria-label", label);
    play.firstElementChild!.innerHTML = isPlaying
      ? videoControlIcons.pause
      : videoControlIcons.play;
    centerPlay.firstElementChild!.innerHTML = isPlaying
      ? videoControlIcons.pause
      : videoControlIcons.play;
    centerPlay.hidden = isPlaying;
  }

  function updateTimeline(): void {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    seek.max = String(duration);
    seek.value = String(Math.min(video.currentTime, duration));
    const position = formatPlaybackTime(video.currentTime);
    time.value = `${position} / ${formatPlaybackTime(duration)}`;
    time.textContent = time.value;
    seek.setAttribute("aria-valuetext", `${position} of ${formatPlaybackTime(duration)}`);
  }

  function updateVolume(): void {
    const value = video.muted ? 0 : clampVolume(video.volume);
    if (!video.muted && value > 0) lastAudibleVolume = value;
    volumeInput.value = String(value);
    volumeInput.setAttribute("aria-valuetext", `${Math.round(value * 100)}%`);
    const isMuted = video.muted || value === 0;
    mute.setAttribute("aria-label", isMuted ? "Unmute video" : "Mute video");
    mute.firstElementChild!.innerHTML = isMuted
      ? videoControlIcons.muted
      : videoControlIcons.volume;
  }

  function updateFullscreen(): void {
    const isFullscreen = document.fullscreenElement === player;
    fullscreen.setAttribute(
      "aria-label",
      isFullscreen ? "Exit fullscreen" : "Enter fullscreen",
    );
  }

  play.addEventListener("click", togglePlayback);
  centerPlay.addEventListener("click", togglePlayback);
  seek.addEventListener("input", () => {
    video.currentTime = Number(seek.value);
    updateTimeline();
  });
  mute.addEventListener("click", () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = lastAudibleVolume;
    } else {
      lastAudibleVolume = video.volume;
      video.muted = true;
    }
  });
  volumeInput.addEventListener("input", () => {
    const value = clampVolume(Number(volumeInput.value));
    if (value > 0) lastAudibleVolume = value;
    video.muted = false;
    video.volume = value;
  });
  volumeInput.addEventListener("wheel", (event) => {
    event.preventDefault();
    const value = clampVolume(video.volume + (event.deltaY < 0 ? 0.01 : -0.01));
    if (value > 0) lastAudibleVolume = value;
    video.muted = false;
    video.volume = value;
  }, { passive: false });
  loop.addEventListener("click", () => {
    video.loop = !video.loop;
    loop.setAttribute("aria-pressed", String(video.loop));
    loop.setAttribute("aria-label", video.loop ? "Turn loop off" : "Turn loop on");
  });
  pip.addEventListener("click", () => {
    const active = player.dataset.pip === "true";
    player.dataset.pip = String(!active);
    pip.setAttribute(
      "aria-label",
      active ? "Keep video playing in Skriuw" : "Return video to note",
    );
    pip.firstElementChild!.innerHTML = active
      ? videoControlIcons.popOut
      : videoControlIcons.returnToNote;
  });
  fullscreen.addEventListener("click", () => {
    if (document.fullscreenElement === player) {
      void document.exitFullscreen();
    } else {
      void player.requestFullscreen?.();
    }
  });
  video.addEventListener("play", updatePlaybackState);
  video.addEventListener("pause", updatePlaybackState);
  video.addEventListener("ended", updatePlaybackState);
  video.addEventListener("loadedmetadata", updateTimeline);
  video.addEventListener("timeupdate", updateTimeline);
  video.addEventListener("volumechange", updateVolume);
  video.addEventListener("error", () => onFailure?.());
  document.addEventListener("fullscreenchange", updateFullscreen, {
    signal: lifecycle.signal,
  });
  video.addEventListener("loadeddata", () => {
    // WebKitGTK does not paint a poster frame for a paused video until a
    // frame is decoded; seeking after loadeddata forces that first frame.
    if (video.currentTime === 0) video.currentTime = 0.001;
  });
  updatePlaybackState();
  updateTimeline();
  updateVolume();

  return player;
}

function disposePlayer(element: HTMLElement | null): void {
  if (element instanceof HTMLDivElement && "disposePlayer" in element) {
    (element as VideoPlayerElement).disposePlayer();
  }
}

function createPlayer(
  kind: MediaKind,
  src: string,
  title: string,
  onOpen?: MediaOpenHandler,
  onFailure?: () => void,
) {
  if (kind === "video") {
    return createVideoPlayer(src, onFailure);
  }
  if (kind !== "file") {
    const player = document.createElement(kind);
    player.className = "note-media";
    player.controls = true;
    player.preload = "metadata";
    if (onFailure) {
      player.addEventListener("error", onFailure);
    }
    player.src = src;
    return player;
  }
  const link = document.createElement("a");
  link.className = "note-media note-media-file";
  link.dataset.mediaFile = "true";
  link.href = src;
  link.textContent = title || mediaTitleFromSource(src);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    onOpen?.(src);
  });
  return link;
}

function createEmptyState(
  kind: MediaKind,
  onSubmit: (src: string) => void,
  onPickFile?: () => void,
) {
  const form = document.createElement("form");
  form.className = "note-media-empty";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "note-media-input";
  input.placeholder = placeholders[kind];
  input.spellcheck = false;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "note-media-submit";
  submit.textContent = "Embed";
  form.append(input, submit);
  if (onPickFile) {
    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = "note-media-submit";
    upload.textContent = "Upload…";
    upload.addEventListener("click", onPickFile);
    form.append(upload);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const src = normalizeSource(input.value);
    if (src) onSubmit(src);
  });
  return { form, input };
}

/**
 * Media embeds hold either a URL (`src`) or a workspace blob reference
 * (`refId`). Stored blobs resolve lazily: the view renders a loading shell
 * until the attach operation lands in the store, then upgrades to a player.
 */
export function createMediaNodeView(
  store: RendererStore,
  node: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  onOpen?: MediaOpenHandler,
  onUpload?: MediaUploadHandler,
): NodeView {
  const dom = document.createElement("div");
  let input: HTMLInputElement | null = null;
  let unsubscribe: (() => void) | null = null;
  let resolvedRefId: string | null = null;
  let paintedKey = "";

  function setAttrs(attrs: Record<string, unknown>): void {
    const position = getPos();
    if (position === undefined) return;
    const current = view.state.doc.nodeAt(position);
    if (!current) return;
    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, ...attrs }),
    );
    view.focus();
  }

  function setSource(src: string): void {
    setAttrs({ src, title: mediaTitleFromSource(src) });
  }

  function pickVideo(): void {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "video/mp4,video/webm";
    picker.hidden = true;
    document.body.append(picker);
    picker.addEventListener("change", () => {
      const file = picker.files?.[0] ?? null;
      picker.remove();
      if (!file || !onUpload) return;
      const assignedId = crypto.randomUUID();
      setAttrs({ refId: assignedId, title: file.name });
      onUpload(file, assignedId);
    });
    picker.addEventListener("cancel", () => picker.remove());
    picker.click();
  }

  function paintFailure(message: string): void {
    disposePlayer(dom.firstElementChild as HTMLElement | null);
    dom.dataset.mediaState = "missing";
    const notice = document.createElement("p");
    notice.className = "note-media-error";
    notice.textContent = message;
    dom.replaceChildren(notice);
  }

  function paintStored(kind: MediaKind, refId: string, title: string): void {
    const image = store.getState().images.get(refId);
    if (!image) {
      dom.dataset.mediaState = "loading";
      dom.replaceChildren();
      unsubscribe ??= store.subscribe(
        (state) => state.images,
        () => {
          const position = getPos();
          const current = position === undefined ? null : view.state.doc.nodeAt(position);
          if (current) render(current);
        },
      );
      return;
    }
    unsubscribe?.();
    unsubscribe = null;
    resolvedRefId = refId;
    const { contentHash, mimeType } = image;
    resolveMediaPlaybackUrl(contentHash, mimeType)
      .then((url) => {
        if (resolvedRefId !== refId) return;
        dom.dataset.mediaState = "ready";
        function retryWithBlobUrl(): void {
          resolveImageBlobUrl(contentHash, mimeType)
            .then((fallbackUrl) => {
              if (resolvedRefId !== refId) return;
              if (fallbackUrl === url) {
                paintFailure("This video can’t be played on this device.");
                return;
              }
              disposePlayer(dom.firstElementChild as HTMLElement | null);
              dom.replaceChildren(
                createPlayer(kind, fallbackUrl, title, onOpen, () => {
                  if (resolvedRefId !== refId) return;
                  paintFailure("This video can’t be played on this device.");
                }),
              );
            })
            .catch(() => {
              if (resolvedRefId !== refId) return;
              paintFailure("This video can’t be played on this device.");
            });
        }
        dom.replaceChildren(createPlayer(kind, url, title, onOpen, retryWithBlobUrl));
      })
      .catch(() => {
        if (resolvedRefId !== refId) return;
        paintFailure("The media file for this embed is missing.");
      });
  }

  function render(current: ProseMirrorNode): void {
    const kind = isMediaKind(current.attrs.kind) ? current.attrs.kind : "video";
    const src = String(current.attrs.src ?? "");
    const refId = String(current.attrs.refId ?? "");
    const title = String(current.attrs.title ?? "");
    const key = `${kind}\0${refId}\0${src}`;
    if (key === paintedKey && dom.dataset.mediaState === "ready") {
      return;
    }
    paintedKey = key;
    disposePlayer(dom.firstElementChild as HTMLElement | null);
    dom.className = "note-media-block";
    dom.dataset.mediaKind = kind;
    input = null;
    if (refId) {
      paintStored(kind, refId, title);
      return;
    }
    resolvedRefId = null;
    dom.dataset.mediaState = src ? "ready" : "empty";
    disposePlayer(dom.firstElementChild as HTMLElement | null);
    dom.replaceChildren();
    if (!src) {
      const canUpload = kind === "video" && onUpload !== undefined;
      const empty = createEmptyState(kind, setSource, canUpload ? pickVideo : undefined);
      input = empty.input;
      dom.append(empty.form);
      return;
    }
    dom.append(createPlayer(kind, src, title, onOpen));
  }

  render(node);

  return {
    dom,
    update(next) {
      if (next.type.name !== "media") return false;
      render(next);
      return true;
    },
    selectNode() {
      dom.classList.add("is-selected");
      input?.focus();
    },
    deselectNode() {
      dom.classList.remove("is-selected");
    },
    destroy() {
      disposePlayer(dom.firstElementChild as HTMLElement | null);
      unsubscribe?.();
      unsubscribe = null;
    },
    stopEvent: (event) => event.target instanceof HTMLElement && dom.contains(event.target),
    ignoreMutation: () => true,
  };
}
