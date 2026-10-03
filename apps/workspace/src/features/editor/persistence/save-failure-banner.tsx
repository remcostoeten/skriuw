import { useEffect, useRef } from "react";
import type { FocusEvent } from "react";

type Props = {
  message: string;
  onRetry: () => void;
  getSurface: () => HTMLElement | null;
};

/**
 * Persistent in-editor notice shown while background saves are failing.
 *
 * The banner sits before the editing surface in the DOM, so forward tabbing
 * from the surface would skip it; pressing Tab on the surface therefore moves
 * focus onto the Retry button, and Escape (or the banner disappearing) hands
 * focus back to the surface.
 */
export function SaveFailureBanner({ message, onRetry, getSurface }: Props) {
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const holdsFocusRef = useRef(false);
  const getSurfaceRef = useRef(getSurface);
  getSurfaceRef.current = getSurface;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const banner = bannerRef.current;
      const button = buttonRef.current;
      const active = document.activeElement;
      if (!banner || !button || !(active instanceof HTMLElement)) return;
      const surface = getSurfaceRef.current();
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.defaultPrevented &&
        surface !== null &&
        (active === surface || surface.contains(active))
      ) {
        event.preventDefault();
        button.focus();
        return;
      }
      if (event.key === "Escape" && banner.contains(active)) {
        event.preventDefault();
        surface?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (holdsFocusRef.current) {
        getSurfaceRef.current()?.focus();
      }
    };
  }, []);

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (!bannerRef.current?.contains(event.relatedTarget as Node | null)) {
      holdsFocusRef.current = false;
    }
  }

  return (
    <div
      ref={bannerRef}
      className="sticky top-3 z-40 mx-auto mb-3 flex max-w-xl items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-popover px-3 py-2 text-[13px] shadow-sm"
      role="alert"
      onFocus={() => {
        holdsFocusRef.current = true;
      }}
      onBlur={handleBlur}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-destructive" />
        <span>{message}</span>
      </span>
      <button
        ref={buttonRef}
        type="button"
        className="shrink-0 rounded-[var(--radius)] border border-border bg-muted/55 px-2 py-1 text-[12px] font-[560] hover:bg-muted"
        onClick={onRetry}
      >
        Retry save
      </button>
    </div>
  );
}
