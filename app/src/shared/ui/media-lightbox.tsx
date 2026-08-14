import { Maximize2, Minimize2, Pause, Play, Repeat2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyIcon } from "@/shared/icons/static";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { Dialog } from "./dialog";
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
  dimensions?: string | null;
  addedAt?: number | null;
  usages?: readonly MediaLightboxUsage[];
  onVideoError?: () => void;
};

export function MediaLightbox({
  open,
  onOpenChange,
  src,
  mimeType,
  byteSize,
  contentHash,
  dimensions,
  addedAt,
  usages = [],
  onVideoError,
}: MediaLightboxProps) {
  const usageCount = usages.length;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Media preview"
      className="h-dvh max-h-none w-screen max-w-none rounded-none border-0"
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
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
              <img
                src={src}
                alt=""
                className="relative block max-h-full max-w-full select-none rounded-sm object-contain shadow-2xl"
                draggable={false}
              />
            )}
          </div>
          <aside className="flex w-full shrink-0 flex-col border-t border-border bg-popover lg:w-80 lg:border-t-0 lg:border-l">
            <div className="border-b border-border px-5 py-4">
              <p className={cn("m-0", sectionLabelClass)}>
                Media details
              </p>
              <p
                className="mt-1.5 break-all font-mono text-xs leading-5 text-foreground"
                title={contentHash}
              >
                {contentHash.slice(0, 16)}…{contentHash.slice(-8)}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => void navigator.clipboard?.writeText(contentHash)}
              >
                <CopyIcon size={13} />
                Copy file ID
              </button>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4 border-b border-border px-5 py-4 text-xs">
              <MediaDetail label="Format" value={mimeType} />
              <MediaDetail label="Size" value={formatByteSize(byteSize)} />
              {dimensions && (
                <MediaDetail label="Dimensions" value={dimensions} />
              )}
              {addedAt !== null && addedAt !== undefined && (
                <MediaDetail label="Added" value={formatMediaDate(addedAt)} />
              )}
            </dl>
            <div className="min-h-0 flex-1 px-3 py-4">
              <div className="flex items-baseline justify-between px-2">
                <h3 className="m-0 text-xs font-semibold text-foreground">
                  Used in
                </h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {usageCount === 0
                    ? "Not used"
                    : usageCount === 1
                      ? "1 place"
                      : `${usageCount} places`}
                </span>
              </div>
              {usageCount === 0 ? (
                <p className="m-0 px-2 pt-3 text-xs leading-5 text-muted-foreground">
                  This file is stored in the workspace but is not used in a note
                  yet.
                </p>
              ) : (
                <ul className="m-0 mt-2 max-h-52 list-none space-y-1 overflow-y-auto p-0 lg:max-h-none">
                  {usages.map((usage) => (
                    <li key={usage.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={usage.onOpen}
                      >
                        <span className="min-w-0 truncate text-xs font-medium text-foreground">
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
            </div>
          </aside>
        </div>
        <footer className="flex shrink-0 items-center justify-between border-t border-border bg-popover px-4 py-2 text-[11px] text-muted-foreground lg:hidden">
          <span>{mimeType}</span>
          <span>{formatByteSize(byteSize)}</span>
        </footer>
      </div>
    </Dialog>
  );
}

const videoControlClass =
  "grid size-8 shrink-0 place-items-center rounded-full text-white transition-[background,transform] duration-150 hover:bg-white/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function MediaLightboxVideo({
  src,
  onError,
}: {
  src: string;
  onError?: () => void;
}) {
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
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
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
        isPip
          ? "fixed right-5 bottom-5 z-[90] w-[min(360px,calc(100vw-32px))]"
          : ""
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
        {isPlaying ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
      </button>
      <div className="absolute right-0 bottom-0 left-0 flex min-h-12 items-center gap-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pt-5 pb-2 text-white">
        <button type="button" className={videoControlClass} aria-label={isPlaying ? "Pause video" : "Play video"} onClick={togglePlayback}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
        </button>
        <output className="min-w-[5.8em] text-[11px] tabular-nums text-white/80" aria-label="Playback time">
          {timeLabel}
        </output>
        <input
          type="range"
          className="h-1 min-w-8 w-full cursor-pointer accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          className="h-1 w-16 cursor-pointer accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              (videoRef.current?.muted ? 0 : videoRef.current?.volume ?? volume) +
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
          <Repeat2 size={16} />
        </button>
        <button type="button" className={videoControlClass} aria-label={isPip ? "Return video to preview" : "Keep video playing in Skriuw"} onClick={() => setIsPip((value) => !value)}>
          {isPip ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button type="button" className={videoControlClass} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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
      <dt className={sectionLabelClass}>
        {label}
      </dt>
      <dd
        className="mt-1 truncate text-xs font-medium text-foreground"
        title={value}
      >
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
