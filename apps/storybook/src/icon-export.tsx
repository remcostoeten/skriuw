import { renderToStaticMarkup } from "react-dom/server";
import {
  ICON_MOTIONS,
  ICON_REGISTRY,
  cssEasing,
  cssTransform,
  resolvePose,
  selectGlyph,
  type AnimatedIconId,
  type GlyphName,
  type IconName,
} from "@skriuw/icons";
import { AppIcon } from "@/shared/icons/app-icon";
import { AnimatedIconsProvider } from "@/shared/icons/animated-icons-context";

export type IconSubject = { kind: "app"; name: IconName } | { kind: "glyph"; name: GlyphName };

function pascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function scopeClass(subject: IconSubject): string {
  return `skriuw-icon-${subject.name.replace(/_/g, "-")}`;
}

function motionOf(subject: IconSubject): AnimatedIconId | undefined {
  if (subject.kind !== "app") return undefined;
  const entry = ICON_REGISTRY[subject.name];
  return "motion" in entry ? entry.motion : undefined;
}

function motionCss(scope: string, motion: AnimatedIconId): string {
  const rules = ICON_MOTIONS[motion].tracks.map((track) => {
    const name = `${scope}-${track.part}`;
    const frames = track.keyframes
      .map((keyframe) => {
        const pose = resolvePose(keyframe);
        const easing = cssEasing(keyframe.ease ?? track.ease);
        return `${+(keyframe.at * 100).toFixed(3)}%{transform:${cssTransform(pose)};opacity:${pose.opacity};animation-timing-function:${easing}}`;
      })
      .join("");
    return `@keyframes ${name}{${frames}}.${scope}:hover [data-motion-part="${track.part}"]{animation:${name} ${track.duration}ms ${track.delay ?? 0}ms both}`;
  });
  return [
    `.${scope}:hover [data-motion-rest]{visibility:hidden}`,
    `.${scope}:hover [data-motion-parts]{visibility:visible}`,
    ...rules,
  ].join("");
}

function innerMarkup(subject: IconSubject, size: number): { grid: number; inner: string } {
  const glyphName = subject.kind === "app" ? ICON_REGISTRY[subject.name].glyph : subject.name;
  const motion = motionOf(subject);
  if (!motion || subject.kind !== "app") {
    const drawing = selectGlyph(glyphName, size);
    return { grid: drawing.grid, inner: `<path d="${drawing.d}"/>` };
  }
  const html = renderToStaticMarkup(
    <AnimatedIconsProvider enabled>
      <AppIcon name={subject.name} size={size} />
    </AnimatedIconsProvider>,
  );
  const svg = new DOMParser().parseFromString(html, "text/html").querySelector("svg")!;
  const scope = scopeClass(subject);
  const prefix = /id="([^"]+?)-/.exec(svg.innerHTML)?.[1];
  const parts = prefix ? svg.innerHTML.replaceAll(prefix, scope) : svg.innerHTML;
  return {
    grid: Number(svg.getAttribute("viewBox")!.split(" ")[3]),
    inner: `<style>${motionCss(scope, motion)}</style>${parts}`,
  };
}

/** Plain name as the registry or Fluent catalog spells it. */
export function iconName(subject: IconSubject): string {
  return subject.name;
}

/** How the workspace app renders this icon. */
export function iconUsage(subject: IconSubject, size: number): string {
  return subject.kind === "app"
    ? `<AppIcon name="${subject.name}" size={${size}} />`
    : `<FluentIcon glyph="${subject.name}" size={${size}} />`;
}

/** Standalone SVG; animated icons carry their motion as hover-triggered CSS keyframes. */
export function iconSvg(subject: IconSubject, size: number): string {
  const { grid, inner } = innerMarkup(subject, size);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${scopeClass(subject)}" viewBox="0 0 ${grid} ${grid}" width="${size}" height="${size}" fill="currentColor" overflow="visible" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/** Dependency-free React component wrapping the standalone SVG. */
export function iconSource(subject: IconSubject, size: number): string {
  const { grid, inner } = innerMarkup(subject, size);
  const component = `${pascalCase(subject.name)}Icon`;
  return `import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  size?: number;
};

const MARKUP = ${JSON.stringify(inner)};

export function ${component}({ size = ${size}, className, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${grid} ${grid}"
      width={size}
      height={size}
      fill="currentColor"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      className={className ? "${scopeClass(subject)} " + className : "${scopeClass(subject)}"}
      {...props}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  );
}
`;
}
