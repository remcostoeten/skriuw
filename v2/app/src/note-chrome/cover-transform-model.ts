export type CoverTransform = {
  positionX: number;
  positionY: number;
  zoom: number;
};

export type CoverFocalPresetId =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type CoverFocalPreset = {
  id: CoverFocalPresetId;
  label: string;
  positionX: number;
  positionY: number;
};

export const COVER_FOCAL_PRESETS = [
  { id: "top-left", label: "Top left", positionX: 0, positionY: 0 },
  { id: "top", label: "Top", positionX: 50, positionY: 0 },
  { id: "top-right", label: "Top right", positionX: 100, positionY: 0 },
  { id: "left", label: "Left", positionX: 0, positionY: 50 },
  { id: "center", label: "Center", positionX: 50, positionY: 50 },
  { id: "right", label: "Right", positionX: 100, positionY: 50 },
  { id: "bottom-left", label: "Bottom left", positionX: 0, positionY: 100 },
  { id: "bottom", label: "Bottom", positionX: 50, positionY: 100 },
  { id: "bottom-right", label: "Bottom right", positionX: 100, positionY: 100 },
] as const satisfies readonly CoverFocalPreset[];

export type CoverKeyboardTransformOptions = {
  shiftKey?: boolean;
  maxZoom?: number;
  panStep?: number;
  largePanStep?: number;
  zoomStep?: number;
  largeZoomStep?: number;
};

const RESET_TRANSFORM: CoverTransform = {
  positionX: 50,
  positionY: 50,
  zoom: 1,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function findFocalPreset(id: CoverFocalPresetId): CoverFocalPreset {
  return COVER_FOCAL_PRESETS.find((preset) => preset.id === id)!;
}

function sameTransform(left: CoverTransform, right: CoverTransform): boolean {
  return (
    left.positionX === right.positionX &&
    left.positionY === right.positionY &&
    left.zoom === right.zoom
  );
}

function changedTransform(
  current: CoverTransform,
  next: CoverTransform,
): CoverTransform {
  return sameTransform(current, next) ? current : next;
}

export function applyCoverFocalPreset(
  transform: CoverTransform,
  presetId: CoverFocalPresetId,
): CoverTransform {
  const preset = findFocalPreset(presetId);
  return changedTransform(transform, {
    ...transform,
    positionX: preset.positionX,
    positionY: preset.positionY,
  });
}

export function coverTransformForKey(
  transform: CoverTransform,
  key: string,
  options: CoverKeyboardTransformOptions = {},
): CoverTransform | null {
  const shifted = options.shiftKey ?? false;
  const panStep = shifted
    ? (options.largePanStep ?? 10)
    : (options.panStep ?? 2);
  const zoomStep = shifted
    ? (options.largeZoomStep ?? 0.25)
    : (options.zoomStep ?? 0.1);
  const maxZoom = Math.max(1, options.maxZoom ?? 3);

  let next: CoverTransform;
  switch (key) {
    case "ArrowLeft":
      next = { ...transform, positionX: clamp(transform.positionX - panStep, 0, 100) };
      break;
    case "ArrowRight":
      next = { ...transform, positionX: clamp(transform.positionX + panStep, 0, 100) };
      break;
    case "ArrowUp":
      next = { ...transform, positionY: clamp(transform.positionY - panStep, 0, 100) };
      break;
    case "ArrowDown":
      next = { ...transform, positionY: clamp(transform.positionY + panStep, 0, 100) };
      break;
    case "+":
    case "=":
      next = { ...transform, zoom: clamp(transform.zoom + zoomStep, 1, maxZoom) };
      break;
    case "-":
    case "_":
      next = { ...transform, zoom: clamp(transform.zoom - zoomStep, 1, maxZoom) };
      break;
    case "Home":
      next = RESET_TRANSFORM;
      break;
    default:
      return null;
  }

  return changedTransform(transform, next);
}
