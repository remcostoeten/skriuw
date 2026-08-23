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
      className="drawing-ink-picker"
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
      <div role="radiogroup" aria-label="Preset ink" className="drawing-ink-presets">
        {DRAWING_INKS.map((ink, index) => (
          <button
            key={ink.id}
            ref={index === 0 ? firstRef : undefined}
            type="button"
            role="radio"
            aria-checked={colorId === ink.id}
            aria-label={ink.label}
            title={`${ink.label} (${ink.key})`}
            className="drawing-ink-preset"
            onClick={() => onSelect(ink.id)}
          >
            <span
              className="drawing-swatch"
              data-selected={colorId === ink.id ? "true" : undefined}
              style={{ backgroundColor: resolveInk(ink.id, dark) }}
            />
          </button>
        ))}
      </div>
      <div className="drawing-ink-custom">
        <input
          type="text"
          className="drawing-ink-input"
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
          className="drawing-ink-apply"
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
