import { noop } from "@skriuw/shared/helpers/noop";

export type KeyboardSize = "auto" | "large" | "xlarge";

export type KeyboardOptions = {
  size: KeyboardSize;
  dwell: boolean;
  dwellMs: number;
  release: boolean;
};

const OPEN_KEY = "skriuw:on-screen-keyboard:v1";

const OPTIONS_KEY = "skriuw:on-screen-keyboard-options:v1";

export const KEYBOARD_SIZES: readonly KeyboardSize[] = ["auto", "large", "xlarge"];

export const DWELL_CHOICES: readonly number[] = [600, 1000, 1500, 2200];

export const DEFAULT_OPTIONS: KeyboardOptions = {
  size: "auto",
  dwell: false,
  dwellMs: 1000,
  release: false,
};

/**
 * @name readKeyboardOpen
 * @description Reads whether the on-screen keyboard was open when the window
 * last closed. It is device layout, so it lives in local storage and not in
 * the synced workspace settings.
 *
 * @example
 * const [open, setOpen] = useState(readKeyboardOpen);
 */
export function readKeyboardOpen(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(OPEN_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * @name writeKeyboardOpen
 * @description Persists whether the on-screen keyboard is open. Storage
 * failures leave the current session unaffected.
 *
 * @example
 * writeKeyboardOpen(true);
 */
export function writeKeyboardOpen(open: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (open) {
      window.localStorage.setItem(OPEN_KEY, "on");
    } else {
      window.localStorage.removeItem(OPEN_KEY);
    }
  } catch {
    noop();
  }
}

/**
 * @name serializeKeyboardOptions
 * @description Encodes the keyboard options as a short comma separated string
 * for local storage.
 *
 * @example
 * serializeKeyboardOptions(DEFAULT_OPTIONS); // "auto,0,1000,0"
 */
export function serializeKeyboardOptions(options: KeyboardOptions): string {
  return [options.size, options.dwell ? 1 : 0, options.dwellMs, options.release ? 1 : 0].join(",");
}

/**
 * @name parseKeyboardOptions
 * @description Decodes stored keyboard options. Anything missing or outside
 * the allowed choices falls back to its default, field by field.
 *
 * @example
 * parseKeyboardOptions("large,1,600,0"); // { size: "large", dwell: true, ... }
 */
export function parseKeyboardOptions(raw: string | null): KeyboardOptions {
  if (raw === null) {
    return DEFAULT_OPTIONS;
  }
  const [size, dwell, dwellMs, release] = raw.split(",");
  const chosenSize = KEYBOARD_SIZES.find((candidate) => candidate === size);
  const chosenDwell = DWELL_CHOICES.find((candidate) => String(candidate) === dwellMs);
  return {
    size: chosenSize ?? DEFAULT_OPTIONS.size,
    dwell: dwell === "1",
    dwellMs: chosenDwell ?? DEFAULT_OPTIONS.dwellMs,
    release: release === "1",
  };
}

/**
 * @name readKeyboardOptions
 * @description Reads the stored keyboard options for this device.
 *
 * @example
 * const [options, setOptions] = useState(readKeyboardOptions);
 */
export function readKeyboardOptions(): KeyboardOptions {
  if (typeof window === "undefined") {
    return DEFAULT_OPTIONS;
  }
  try {
    return parseKeyboardOptions(window.localStorage.getItem(OPTIONS_KEY));
  } catch {
    return DEFAULT_OPTIONS;
  }
}

/**
 * @name writeKeyboardOptions
 * @description Persists the keyboard options. Storage failures leave the
 * current session unaffected.
 *
 * @example
 * writeKeyboardOptions({ ...options, size: "large" });
 */
export function writeKeyboardOptions(options: KeyboardOptions): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(OPTIONS_KEY, serializeKeyboardOptions(options));
  } catch {
    noop();
  }
}

/**
 * @name keyboardUnit
 * @description The pixel size of one key-width unit. Fit uses the dock width,
 * clamped so keys stay at least 26px and at most 42px; the larger sizes are
 * fixed and the dock scrolls sideways when they overflow.
 *
 * @example
 * const unit = keyboardUnit("auto", 1280, 23);
 */
export function keyboardUnit(
  size: KeyboardSize,
  availableWidth: number,
  boardWidth: number,
): number {
  if (size === "large") {
    return 60;
  }
  if (size === "xlarge") {
    return 78;
  }
  const fitted = Math.floor((availableWidth - 48) / (boardWidth + 0.6));
  return Math.max(26, Math.min(42, fitted));
}
