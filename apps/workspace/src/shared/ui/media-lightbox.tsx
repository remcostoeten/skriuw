import {
  CloseIcon,
  CopyIcon,
  EnterFullscreenIcon,
  ExitFullscreenIcon,
  PauseIcon,
  PictureInPictureEnterIcon,
  PictureInPictureExitIcon,
  PlayIcon,
  RepeatIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "@/shared/icons/static";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { Dialog, useDialogClose } from "./dialog";
import {
  clampPan,
  DOUBLE_TAP_SLOP_PX,
  IDENTITY_ZOOM,
  isDoubleTap,
  midpoint,
  pointDistance,
  swipeDismisses,
  toggleZoom,
  zoomAround,
  type Point,
  type ZoomTransform,
} from "./zoom-gesture";
import { cn } from "@/shared/lib/utils";
import { sectionLabelClass } from "@/shared/ui/section-header";

export type MediaLightboxUsage = {
  id: string;
  title: string;
  detail: string;
  onOpen: () => void;
};

type MediaLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  title?: string;
  alt?: string;
  dimensions?: string | null;
  addedAt?: number | null;
  usages?: readonly MediaLightboxUsage[];
  onVideoError?: () => void;
};

const touchTargetClass = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export function MediaLightbox({
  open,
  onOpenChange,
  src,
  mimeType,
  byteSize,
  contentHash,
  title = "Media preview",
  alt = "",
  dimensions,
  addedAt,
  usages = [],
  onVideoError,
}: MediaLightboxProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      showHeader={false}
      className="h-dvh max-h-none w-screen max-w-none rounded-none border-0 pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]"
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <MediaLightboxHeader title={title} />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[hsl(var(--foreground)/0.035)] p-5 sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, hsl(var(--foreground)/0.04) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--foreground)/0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--foreground)/0.04) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--foreground)/0.04) 75%)",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
                backgroundSize: "20px 20px",
              }}
            />
            {mimeType.startsWith("video/") ? (
              <MediaLightboxVideo src={src} onError={onVideoError} />
            ) : (
              <ZoomableImage src={src} alt={alt} />
            )}
          </div>
          <aside className="flex max-h-[45%] w-full shrink-0 flex-col overflow-y-auto border-t border-border bg-popover lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
            <div className="border-b border-border px-5 py-4">
              <p className={cn("m-0", sectionLabelClass)}>Media details</p>
              <p
                className="mt-1.5 break-all font-mono text-xs leading-5 text-foreground"
                title={contentHash}
              >
                {contentHash.slice(0, 16)}…{contentHash.slice(-8)}
              </p>
              <button
                type="button"
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:px-3 pointer-coarse:text-[13px]",
                  touchTargetClass,
                )}
                onClick={() => void navigator.clipboard?.writeText(contentHash)}
              >
                <CopyIcon size={13} />
                Copy file ID
              </button>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4 border-b border-border px-5 py-4 text-xs">
              <MediaDetail label="Format" value={mimeType} />
              <MediaDetail label="Size" value={formatByteSize(byteSize)} />
              {dimensions && <MediaDetail label="Dimensions" value={dimensions} />}
              {addedAt !== null && addedAt !== undefined && (
                <MediaDetail label="Added" value={formatMediaDate(addedAt)} />
              )}
            </dl>
            <div className="min-h-0 flex-1 px-3 py-4">
              <MediaUsageList usages={usages} />
            </div>
          </aside>
        </div>
      </div>
    </Dialog>
  );
}

function MediaLightboxHeader({ title }: { title: string }) {
  const close = useDialogClose();
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-popover py-1 pr-1 pl-4">
      <h2 className="m-0 min-w-0 truncate text-sm font-semibold text-foreground">{title}</h2>
      <button
        type="button"
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius)] border-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close preview"
        onClick={close}
      >
        <CloseIcon size={18} />
      </button>
    </header>
  );
}

/**
 * Lists the notes that reference a file. Closes the enclosing dialog through
 * the native element before navigating, so the opened note can take focus.
 */
export function MediaUsageList({ usages }: { usages: readonly MediaLightboxUsage[] }) {
  const close = useDialogClose();
  const usageCount = usages.length;
  return (
    <>
      <div className="flex items-baseline justify-between px-2">
        <h3 className="m-0 text-xs font-semibold text-foreground">Used in</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {usageCount === 0 ? "Not used" : usageCount === 1 ? "1 place" : `${usageCount} places`}
        </span>
      </div>
      {usageCount === 0 ? (
        <p className="m-0 px-2 pt-3 text-xs leading-5 text-muted-foreground">
          This file is stored in the workspace but is not used in a note yet.
        </p>
      ) : (
        <ul className="m-0 mt-2 max-h-52 list-none space-y-1 overflow-y-auto p-0 lg:max-h-none">
          {usages.map((usage) => (
            <li key={usage.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                onClick={() => {
                  close();
                  usage.onOpen();
                }}
              >
                <span className="min-w-0 truncate text-xs font-medium text-foreground pointer-coarse:text-sm">
                  {usage.title}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {usage.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

type Gesture =
  | { kind: "idle" }
  | { kind: "pan"; pointerId: number; start: Point; origin: ZoomTransform; moved: boolean }
  | { kind: "pinch"; startDistance: number; origin: ZoomTransform; focus: Point };

/**
 * Image stage with pinch and double-tap zoom, pan while zoomed, and a
 * swipe-down dismiss at rest. The transform is written straight to the DOM so
 * a gesture never re-renders React.
 */
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const close = useDialogClose();
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<ZoomTransform>(IDENTITY_ZOOM);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture>({ kind: "idle" });
  const lastTapRef = useRef<{ time: number; point: Point } | null>(null);

  function stageFocus(point: Point): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
  }

  function apply(next: ZoomTransform, settle: boolean, dismissOffset = 0): void {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image) return;
    const bounded = clampPan(
      next,
      { width: stage.clientWidth, height: stage.clientHeight },
      { width: image.offsetWidth, height: image.offsetHeight },
    );
    transformRef.current = bounded;
    image.style.transition = settle ? "transform 180ms ease-out, opacity 180ms ease-out" : "none";
    image.style.transform = `translate(${bounded.x}px, ${bounded.y + dismissOffset}px) scale(${bounded.scale})`;
    image.style.opacity = dismissOffset > 0 ? String(Math.max(0.4, 1 - dismissOffset / 400)) : "";
    image.style.cursor = bounded.scale > 1 ? "grab" : "zoom-in";
  }

  function startGesture(): void {
    const [first, second] = [...pointersRef.current.entries()];
    if (first && second) {
      gestureRef.current = {
        kind: "pinch",
        startDistance: Math.max(1, pointDistance(first[1], second[1])),
        origin: transformRef.current,
        focus: stageFocus(midpoint(first[1], second[1])),
      };
    } else if (first) {
      gestureRef.current = {
        kind: "pan",
        pointerId: first[0],
        start: first[1],
        origin: transformRef.current,
        moved: false,
      };
    } else {
      gestureRef.current = { kind: "idle" };
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (gesture.kind === "pinch") {
      const [first, second] = [...pointersRef.current.values()];
      if (!first || !second) return;
      const scale = (gesture.origin.scale * pointDistance(first, second)) / gesture.startDistance;
      apply(zoomAround(gesture.origin, gesture.focus, scale), false);
      return;
    }
    if (gesture.kind !== "pan" || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.start.x;
    const dy = event.clientY - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < DOUBLE_TAP_SLOP_PX / 2) return;
    gesture.moved = true;
    if (gesture.origin.scale > 1) {
      apply({ ...gesture.origin, x: gesture.origin.x + dx, y: gesture.origin.y + dy }, false);
    } else if (event.pointerType === "touch") {
      apply(IDENTITY_ZOOM, false, Math.max(0, dy));
    }
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    const gesture = gestureRef.current;
    pointersRef.current.delete(event.pointerId);
    if (gesture.kind === "pan" && event.pointerId === gesture.pointerId && !cancelled) {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      if (!gesture.moved) {
        handleTap(point);
      } else if (event.pointerType === "touch" && swipeDismisses(gesture.origin.scale, dx, dy)) {
        close();
        return;
      }
    }
    if (pointersRef.current.size === 0 && transformRef.current.scale <= 1) {
      apply(IDENTITY_ZOOM, true);
    }
    startGesture();
  }

  function handleTap(point: Point): void {
    const now = performance.now();
    if (isDoubleTap(lastTapRef.current, now, point)) {
      lastTapRef.current = null;
      apply(toggleZoom(transformRef.current, stageFocus(point)), true);
      return;
    }
    lastTapRef.current = { time: now, point };
  }

  return (
    <div
      ref={stageRef}
      className="absolute inset-0 flex touch-none items-center justify-center overflow-hidden p-5 sm:p-8"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerEnd(event, false)}
      onPointerCancel={(event) => onPointerEnd(event, true)}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="relative block max-h-full max-w-full cursor-zoom-in select-none rounded-sm object-contain shadow-2xl will-change-transform"
        draggable={false}
      />
    </div>
  );
}

const videoControlClass =
  "grid size-8 pointer-coarse:size-11 shrink-0 place-items-center rounded-full text-white transition-[background,transform] duration-150 hover:bg-white/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const videoSliderClass = cn(
  "h-1 cursor-pointer appearance-none rounded-full bg-transparent outline-none",
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full",
  "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-translate-y-1 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.4)]",
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "forced-colors:appearance-auto",
);

/** Paints the filled portion of a range track, since no cross-browser property does. */
function sliderTrackStyle(fraction: number): { background: string } {
  const percent = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  return {
    background: `linear-gradient(to right, #fff ${percent}, rgb(255 255 255 / 0.3) ${percent})`,
  };
}

function MediaLightboxVideo({ src, onError }: { src: string; onError?: () => void }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [loop, setLoop] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function updateVolume(value: number): void {
    const nextVolume = Math.min(1, Math.max(0, Math.round(value * 100) / 100));
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = nextVolume;
    setVolume(nextVolume);
  }

  function togglePlayback(): void {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function toggleFullscreen(): void {
    const player = playerRef.current;
    if (!player) return;
    if (document.fullscreenElement === player) {
      void document.exitFullscreen();
    } else {
      void player.requestFullscreen();
    }
  }

  const timeLabel = `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`;
  return (
    <div
      ref={playerRef}
      className={`relative block max-h-full max-w-full overflow-hidden rounded-sm bg-black shadow-2xl ${
        isPip ? "fixed right-5 bottom-5 z-[90] w-[min(360px,calc(100vw-32px))]" : ""
      }`}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="block max-h-full max-w-full select-none object-contain"
        onError={onError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onVolumeChange={(event) =>
          setVolume(event.currentTarget.muted ? 0 : event.currentTarget.volume)
        }
      />
      <button
        type="button"
        className={`${videoControlClass} absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80`}
        aria-label={isPlaying ? "Pause video" : "Play video"}
        onClick={togglePlayback}
        hidden={isPlaying}
      >
        {isPlaying ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
      </button>
      <div className="absolute right-0 bottom-0 left-0 flex min-h-12 items-center gap-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-5 pb-2 text-white">
        <button
          type="button"
          className={videoControlClass}
          aria-label={isPlaying ? "Pause video" : "Play video"}
          onClick={togglePlayback}
        >
          {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <output
          className="min-w-[5.8em] text-[11px] tabular-nums text-white/80"
          aria-label="Playback time"
        >
          {timeLabel}
        </output>
        <input
          type="range"
          className={cn(videoSliderClass, "w-full min-w-8")}
          style={sliderTrackStyle(duration > 0 ? currentTime / duration : 0)}
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          aria-label="Playback position"
          aria-valuetext={`${formatPlaybackTime(currentTime)} of ${formatPlaybackTime(duration)}`}
          onChange={(event) => {
            const nextTime = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
        />
        <button
          type="button"
          className={videoControlClass}
          aria-label={volume === 0 ? "Unmute video" : "Mute video"}
          onClick={() => updateVolume(volume === 0 ? 0.5 : 0)}
        >
          {volume === 0 ? <VolumeOffIcon size={16} /> : <VolumeIcon size={16} />}
        </button>
        <input
          type="range"
          className={cn(videoSliderClass, "w-16")}
          style={sliderTrackStyle(volume)}
          min="0"
          max="1"
          step="0.01"
          value={volume}
          aria-label="Volume"
          aria-valuetext={`${Math.round(volume * 100)}%`}
          onChange={(event) => updateVolume(Number(event.target.value))}
          onWheel={(event) => {
            event.preventDefault();
            updateVolume(
              (videoRef.current?.muted ? 0 : (videoRef.current?.volume ?? volume)) +
                (event.deltaY < 0 ? 0.01 : -0.01),
            );
          }}
        />
        <button
          type="button"
          className={`${videoControlClass} ${loop ? "bg-white/25" : ""}`}
          aria-label={loop ? "Turn loop off" : "Turn loop on"}
          aria-pressed={loop}
          onClick={() => {
            const nextLoop = !loop;
            if (videoRef.current) videoRef.current.loop = nextLoop;
            setLoop(nextLoop);
          }}
        >
          <RepeatIcon size={16} />
        </button>
        <button
          type="button"
          className={videoControlClass}
          aria-label={isPip ? "Return video to preview" : "Keep video playing in Skriuw"}
          onClick={() => setIsPip((value) => !value)}
        >
          {isPip ? <PictureInPictureExitIcon size={16} /> : <PictureInPictureEnterIcon size={16} />}
        </button>
        <button
          type="button"
          className={videoControlClass}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <ExitFullscreenIcon size={16} /> : <EnterFullscreenIcon size={16} />}
        </button>
      </div>
    </div>
  );
}

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function MediaDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={sectionLabelClass}>{label}</dt>
      <dd className="mt-1 truncate text-xs font-medium text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

function formatMediaDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
