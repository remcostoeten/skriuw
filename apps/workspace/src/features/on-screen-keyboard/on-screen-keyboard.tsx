import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { CloseIcon, KeyboardIcon } from "@/shared/icons/static";
import { deliverStroke, findEditable, isEditableElement, scrollEditable } from "./input";
import { FULL_SIZE_KEYS, LATCH_LABELS, LATCH_ORDER, boardExtent, nearestKey } from "./keys";
import type { KeyDefinition, Latch } from "./keys";
import {
  DWELL_CHOICES,
  KEYBOARD_SIZES,
  keyboardUnit,
  readKeyboardOptions,
  writeKeyboardOptions,
} from "./preferences";
import type { KeyboardSize } from "./preferences";
import { INITIAL_LATCHES, pressKey } from "./press";
import type { Latches, Stroke } from "./press";

type Props = {
  onClose: () => void;
};

const SIZE_LABELS: Record<KeyboardSize, string> = {
  auto: "Fit to window",
  large: "Large",
  xlarge: "Extra large",
};

const KEY_BY_CODE = new Map(FULL_SIZE_KEYS.map((key) => [key.code, key]));

const EXTENT = boardExtent(FULL_SIZE_KEYS);

const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const LED_LATCHES: readonly Latch[] = ["numlock", "caps", "scroll"];

const LED_LABELS: Record<string, string> = { numlock: "Num", caps: "Caps", scroll: "Scroll" };

const HOME_ROW_BUMPS = new Set(["KeyF", "KeyJ", "Numpad5"]);

const REPEAT_DELAY_MS = 420;

const REPEAT_INTERVAL_MS = 40;

const TAP_FLASH_MS = 110;

function keyFromTarget(target: EventTarget): KeyDefinition | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const code = target.closest<HTMLElement>("[data-code]")?.dataset.code;
  return code === undefined ? null : (KEY_BY_CODE.get(code) ?? null);
}

function unit(multiplier: number): string {
  return `calc(var(--osk-u) * ${multiplier})`;
}

export function OnScreenKeyboard({ onClose }: Props) {
  const [latches, setLatches] = useState<Latches>(INITIAL_LATCHES);
  const [options, setOptions] = useState(readKeyboardOptions);
  const [announcement, setAnnouncement] = useState("On-screen keyboard open");
  const dockRef = useRef<HTMLElement>(null);
  const bayRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const latchesRef = useRef(latches);
  const optionsRef = useRef(options);
  const editableRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<KeyDefinition | null>(null);
  const dwellRef = useRef<{ key: KeyDefinition; timer: number } | null>(null);
  const repeatRef = useRef({ delay: 0, tick: 0 });
  optionsRef.current = options;

  function keyElement(code: string): HTMLElement | null {
    return boardRef.current?.querySelector<HTMLElement>(`[data-code="${code}"]`) ?? null;
  }

  function setPressed(code: string, pressed: boolean): void {
    keyElement(code)?.toggleAttribute("data-pressed", pressed);
  }

  function clearPressed(): void {
    for (const element of boardRef.current?.querySelectorAll("[data-pressed]") ?? []) {
      element.removeAttribute("data-pressed");
    }
  }

  function typeInto(target: HTMLElement, stroke: Stroke): void {
    const previous = document.activeElement;
    if (previous !== target) {
      target.focus({ preventScroll: true });
    }
    deliverStroke(target, stroke);
    const returnFocus =
      previous instanceof HTMLElement && previous !== target && dockRef.current?.contains(previous);
    if (returnFocus) {
      previous.focus({ preventScroll: true });
    }
  }

  function press(key: KeyDefinition): void {
    const result = pressKey(latchesRef.current, key);
    latchesRef.current = result.latches;
    setLatches(result.latches);
    if (result.announcement) {
      setAnnouncement(result.announcement);
    }
    const target = findEditable(document, editableRef.current);
    if (!target) {
      return;
    }
    if (result.scroll !== 0) {
      scrollEditable(target, result.scroll);
    }
    if (result.stroke) {
      typeInto(target, result.stroke);
    }
  }

  function tap(key: KeyDefinition): void {
    setPressed(key.code, true);
    press(key);
    window.setTimeout(() => setPressed(key.code, false), TAP_FLASH_MS);
  }

  function stopRepeat(): void {
    window.clearTimeout(repeatRef.current.delay);
    window.clearInterval(repeatRef.current.tick);
  }

  function cancelDwell(): void {
    const dwell = dwellRef.current;
    if (!dwell) {
      return;
    }
    window.clearTimeout(dwell.timer);
    keyElement(dwell.key.code)?.removeAttribute("data-dwelling");
    dwellRef.current = null;
  }

  function startDwell(key: KeyDefinition): void {
    cancelDwell();
    const element = keyElement(key.code);
    element?.style.setProperty("--osk-dwell", `${optionsRef.current.dwellMs}ms`);
    element?.setAttribute("data-dwelling", "");
    const timer = window.setTimeout(() => {
      element?.removeAttribute("data-dwelling");
      dwellRef.current = null;
      tap(key);
    }, optionsRef.current.dwellMs);
    dwellRef.current = { key, timer };
  }

  function setRoving(code: string): void {
    for (const element of boardRef.current?.querySelectorAll<HTMLElement>("[data-code]") ?? []) {
      element.tabIndex = element.dataset.code === code ? 0 : -1;
    }
  }

  function closeKeyboard(): void {
    editableRef.current?.focus({ preventScroll: true });
    onClose();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const key = keyFromTarget(event.target);
    if (!key || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    cancelDwell();
    setPressed(key.code, true);
    if (optionsRef.current.release) {
      pendingRef.current = key;
      return;
    }
    press(key);
    if (key.kind === "mod") {
      return;
    }
    stopRepeat();
    repeatRef.current.delay = window.setTimeout(() => {
      repeatRef.current.tick = window.setInterval(() => press(key), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }

  function onPointerOver(event: ReactPointerEvent<HTMLDivElement>): void {
    const key = keyFromTarget(event.target);
    if (!optionsRef.current.dwell || !key || event.pointerType === "touch") {
      return;
    }
    if (dwellRef.current?.key !== key) {
      startDwell(key);
    }
  }

  function onPointerOut(event: ReactPointerEvent<HTMLDivElement>): void {
    const dwell = dwellRef.current;
    const element = dwell ? keyElement(dwell.key.code) : null;
    const next = event.relatedTarget;
    if (element && !(next instanceof Node && element.contains(next))) {
      cancelDwell();
    }
  }

  function onClick(event: ReactMouseEvent<HTMLDivElement>): void {
    const key = keyFromTarget(event.target);
    if (key && event.detail === 0) {
      tap(key);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      editableRef.current?.focus();
      return;
    }
    const direction = DIRECTIONS[event.key];
    const current = keyFromTarget(event.target);
    if (!direction || !current) {
      return;
    }
    event.preventDefault();
    const next = nearestKey(FULL_SIZE_KEYS, current, direction);
    if (next) {
      setRoving(next.code);
      keyElement(next.code)?.focus();
    }
  }

  useEffect(() => {
    function remember(event: FocusEvent): void {
      const target = event.target;
      if (isEditableElement(target) && !dockRef.current?.contains(target)) {
        editableRef.current = target;
      }
    }
    if (isEditableElement(document.activeElement)) {
      editableRef.current = document.activeElement;
    }
    function release(event: PointerEvent): void {
      stopRepeat();
      clearPressed();
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) {
        return;
      }
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (hit && keyFromTarget(hit) === pending) {
        tap(pending);
      }
    }
    function abandon(): void {
      pendingRef.current = null;
      stopRepeat();
      clearPressed();
    }
    document.addEventListener("focusin", remember);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", abandon);
    return () => {
      document.removeEventListener("focusin", remember);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", abandon);
      stopRepeat();
      cancelDwell();
    };
  }, []);

  useEffect(() => {
    const dock = dockRef.current;
    const bay = bayRef.current;
    if (!dock || !bay) {
      return;
    }
    function fit(): void {
      dock?.style.setProperty(
        "--osk-u",
        `${keyboardUnit(options.size, bay?.clientWidth ?? 0, EXTENT.width)}px`,
      );
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(bay);
    return () => observer.disconnect();
  }, [options.size]);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) {
      return;
    }
    const root = document.documentElement;
    root.dataset.osk = "open";
    function reserve(): void {
      root.style.setProperty("--osk-height", `${dock?.offsetHeight ?? 0}px`);
    }
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      delete root.dataset.osk;
      root.style.removeProperty("--osk-height");
    };
  }, []);

  useEffect(() => {
    writeKeyboardOptions(options);
    if (!options.dwell) {
      cancelDwell();
    }
  }, [options]);

  const latched = LATCH_ORDER.filter(
    (name) => latches[name] && name !== "numlock" && name !== "scroll",
  ).map((name) => LATCH_LABELS[name]);

  return (
    <section
      ref={dockRef}
      className="osk"
      aria-label="On-screen keyboard"
      data-shifted={latches.shift !== latches.caps ? "true" : "false"}
      data-numoff={latches.numlock ? "false" : "true"}
    >
      <div className="osk-bar">
        <span className="osk-title">
          <KeyboardIcon size={15} />
          On-screen keyboard
        </span>
        <span className="osk-status" aria-hidden="true">
          {latched.length > 0 ? `Latched: ${latched.join(", ")}` : ""}
        </span>
        <div className="osk-options">
          <button
            type="button"
            role="switch"
            className="osk-switch"
            aria-checked={options.dwell}
            onClick={() => setOptions((current) => ({ ...current, dwell: !current.dwell }))}
          >
            Dwell click
          </button>
          <select
            className="osk-select"
            aria-label="Dwell time"
            value={options.dwellMs}
            onChange={(event) =>
              setOptions((current) => ({ ...current, dwellMs: Number(event.target.value) }))
            }
          >
            {DWELL_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice / 1000} s
              </option>
            ))}
          </select>
          <button
            type="button"
            role="switch"
            className="osk-switch"
            aria-checked={options.release}
            onClick={() => setOptions((current) => ({ ...current, release: !current.release }))}
          >
            Activate on release
          </button>
          <select
            className="osk-select"
            aria-label="Key size"
            value={options.size}
            onChange={(event) => {
              const size = KEYBOARD_SIZES.find((choice) => choice === event.target.value);
              if (size) {
                setOptions((current) => ({ ...current, size }));
              }
            }}
          >
            {KEYBOARD_SIZES.map((choice) => (
              <option key={choice} value={choice}>
                {SIZE_LABELS[choice]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="osk-close"
            aria-label="Close on-screen keyboard"
            onClick={closeKeyboard}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      <div ref={bayRef} className="osk-bay">
        <div className="osk-case">
          <div
            ref={boardRef}
            className="osk-board"
            role="group"
            aria-label="Keys"
            style={{ width: unit(EXTENT.width), height: unit(EXTENT.height) }}
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
            onClick={onClick}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              const key = keyFromTarget(event.target);
              if (key) {
                setRoving(key.code);
              }
            }}
          >
            {FULL_SIZE_KEYS.map((key, index) => (
              <button
                key={key.code}
                type="button"
                className="osk-key"
                data-code={key.code}
                data-kind={key.kind}
                data-shape={key.shape}
                data-secondary={key.shape === "single" && key.top !== null ? "" : undefined}
                data-bump={HOME_ROW_BUMPS.has(key.code) ? "" : undefined}
                data-latched={key.latch && latches[key.latch] ? "" : undefined}
                aria-label={key.spoken}
                aria-pressed={key.latch ? latches[key.latch] : undefined}
                tabIndex={index === 0 ? 0 : -1}
                style={{
                  left: unit(key.x),
                  top: unit(key.y),
                  width: unit(key.width),
                  height: unit(key.height),
                }}
              >
                <span className="osk-cap">
                  {key.top !== null && <span className="osk-top">{key.top}</span>}
                  <span className="osk-bot">{key.label}</span>
                </span>
              </button>
            ))}
            <div className="osk-leds" aria-hidden="true">
              {LED_LATCHES.map((name) => (
                <span key={name} className="osk-led" data-on={latches[name] ? "" : undefined}>
                  <i />
                  {LED_LABELS[name]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
