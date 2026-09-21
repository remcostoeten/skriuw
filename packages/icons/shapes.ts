/**
 * Outline shapes drawn in Fluent's regular style (1.5-unit weight on the 24
 * grid) for the few animated parts that have no counterpart in a Fluent glyph:
 * the sheet inside the notes folder, the search glint and the pin ripple.
 * Outer contours run clockwise and holes counter-clockwise, so they render
 * under the nonzero fill rule like the Fluent paths they sit beside.
 */

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  clockwise: boolean,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  const right = x + width;
  const bottom = y + height;
  if (clockwise) {
    return [
      `M${n(x + r)} ${n(y)}`,
      `H${n(right - r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(right)} ${n(y + r)}`,
      `V${n(bottom - r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(right - r)} ${n(bottom)}`,
      `H${n(x + r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(bottom - r)}`,
      `V${n(y + r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
      "Z",
    ].join("");
  }
  return [
    `M${n(x + r)} ${n(y)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(x)} ${n(y + r)}`,
    `V${n(bottom - r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(x + r)} ${n(bottom)}`,
    `H${n(right - r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(right)} ${n(bottom - r)}`,
    `V${n(y + r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(right - r)} ${n(y)}`,
    "Z",
  ].join("");
}

/** A rounded rectangle outline of the given weight. */
export function outlineRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  weight = 1.5,
): string {
  return (
    roundedRect(x, y, width, height, radius, true) +
    roundedRect(
      x + weight,
      y + weight,
      width - 2 * weight,
      height - 2 * weight,
      Math.max(0, radius - weight),
      false,
    )
  );
}

/** A circle outline of the given weight, centred on (cx, cy). */
export function outlineCircle(cx: number, cy: number, radius: number, weight = 1.5): string {
  const outer = radius + weight / 2;
  const inner = radius - weight / 2;
  return (
    `M${n(cx + outer)} ${n(cy)}A${n(outer)} ${n(outer)} 0 1 1 ${n(cx - outer)} ${n(cy)}A${n(outer)} ${n(outer)} 0 1 1 ${n(cx + outer)} ${n(cy)}Z` +
    `M${n(cx + inner)} ${n(cy)}A${n(inner)} ${n(inner)} 0 1 0 ${n(cx - inner)} ${n(cy)}A${n(inner)} ${n(inner)} 0 1 0 ${n(cx + inner)} ${n(cy)}Z`
  );
}

/** An arc stroke with round caps, from `fromDegrees` to `toDegrees` clockwise. */
export function arcBand(
  cx: number,
  cy: number,
  radius: number,
  fromDegrees: number,
  toDegrees: number,
  weight = 1.5,
): string {
  const half = weight / 2;
  function point(r: number, degrees: number): string {
    const radians = (degrees * Math.PI) / 180;
    return `${n(cx + r * Math.cos(radians))} ${n(cy + r * Math.sin(radians))}`;
  }
  const large = toDegrees - fromDegrees > 180 ? 1 : 0;
  return [
    `M${point(radius + half, fromDegrees)}`,
    `A${n(radius + half)} ${n(radius + half)} 0 ${large} 1 ${point(radius + half, toDegrees)}`,
    `A${n(half)} ${n(half)} 0 0 1 ${point(radius - half, toDegrees)}`,
    `A${n(radius - half)} ${n(radius - half)} 0 ${large} 0 ${point(radius - half, fromDegrees)}`,
    `A${n(half)} ${n(half)} 0 0 1 ${point(radius + half, fromDegrees)}`,
    "Z",
  ].join("");
}
