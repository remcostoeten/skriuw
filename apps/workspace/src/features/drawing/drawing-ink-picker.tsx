import { useEffect, useRef, useState } from "react";
import { isDrawingColor } from "@/features/editor/drawing-layer";
import { DRAWING_INKS, resolveInk } from "./drawing-brush";

type Props = {
  x: number;
  y: number;
  dark: boolean;
  colorId: string;
  onSelect: (colorId: string) => void;
  onClose: () => void;
};

const PICKER_WIDTH = 208;
const PICKER_HEIGHT = 116;
const EDGE_GAP = 8;

/**
 * The right-click ink picker: the eight theme-aware presets the digit keys
 * select, plus a free hex field for anything else. Positioned in viewport
 * coordinates and clamped to the window, since it opens at the pointer.
 */
export function DrawingInkPicker({ x, y, dark, colorId, onSelect, onClose }: Props) {
  const [custom, setCustom] = useState(() => (isPresetInk(colorId) ? "" : colorId));
  const firstRef = useRef<HTMLButtonElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const left = Math.max(EDGE_GAP, Math.min(x, window.innerWidth - PICKER_WIDTH - EDGE_GAP));
  const top = Math.max(EDGE_GAP, Math.min(y, window.innerHeight - PICKER_HEIGHT - EDGE_GAP));
  const customValid = custom.trim().length > 0 && isDrawingColor(custom.trim());

  function submitCustom(): void {
    if (!customValid) return;
    onSelect(custom.trim());
  }

  return (
    <div
      ref={hostRef}
      role="dialog"
      aria-label="Ink color"
      className="drawing-ink-picker fixed z-50 flex w-52 flex-col gap-2 rounded-lg border border-[hsl(var(--border)/0.6)] bg-popover p-2 shadow-[0_8px_24px_hsl(var(--scrim)/0.32)]"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) onClose();
      }}
    >
      <div
        role="radiogroup"
        aria-label="Preset ink"
        className="drawing-ink-presets grid grid-cols-8 gap-0.5"
      >
        {DRAWING_INKS.map((ink, index) => (
          <button
            key={ink.id}
            ref={index === 0 ? firstRef : undefined}
            type="button"
            role="radio"
            aria-checked={colorId === ink.id}
            aria-label={ink.label}
            title={`${ink.label} (${ink.key})`}
            className="drawing-ink-preset flex h-[22px] items-center justify-center rounded-[5px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
            onClick={() => onSelect(ink.id)}
          >
            <span
              className="drawing-swatch pointer-events-none size-3.5 rounded-full shadow-[inset_0_0_0_1px_hsl(var(--scrim)/0.2)] data-[selected=true]:shadow-[inset_0_0_0_2px_hsl(var(--foreground)/0.7)]"
              data-selected={colorId === ink.id ? "true" : undefined}
              style={{ backgroundColor: resolveInk(ink.id, dark) }}
            />
          </button>
        ))}
      </div>
      <div className="drawing-ink-custom flex items-center gap-1">
        <input
          type="text"
          className="drawing-ink-input min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          aria-label="Custom color"
          placeholder="#7c3aed"
          spellCheck={false}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submitCustom();
          }}
        />
        <button
          type="button"
          className="drawing-ink-apply rounded-md bg-[hsl(var(--foreground)/0.1)] px-2 py-1 text-[11px] text-foreground disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          disabled={!customValid}
          onClick={submitCustom}
        >
          Use
        </button>
      </div>
    </div>
  );
}

function isPresetInk(colorId: string): boolean {
  return DRAWING_INKS.some((ink) => ink.id === colorId);
}
