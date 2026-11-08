"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";

export type IllustrationLoop = "float" | "spread" | "pulse";

export type IllustrationProps = ComponentPropsWithoutRef<"div"> & {
  loop?: boolean | IllustrationLoop;
};

const frame = "h-30 w-50 text-current [&>svg]:size-full [&>svg]:overflow-visible";
const wave =
  "origin-bottom [transform-box:fill-box] in-data-loop:animate-[esi-bar_3.2s_cubic-bezier(0.77,0,0.175,1)_calc(var(--esi-n)*250ms)_infinite]";
const lift = "in-data-loop:animate-[esi-lift_3s_cubic-bezier(0.77,0,0.175,1)_infinite]";
const march = "in-data-loop:animate-[esi-march_1.6s_linear_infinite]";
const keyframes =
  "@keyframes esi-scan{0%,15%{translate:0 0}25%,40%{translate:14px 7px}50%,65%{translate:0 14px}75%,90%{translate:-14px 7px}}@keyframes esi-bar{50%{scale:1 0.72}}@keyframes esi-march{to{stroke-dashoffset:-8}}@keyframes esi-lift{50%{translate:0 -3px}}@keyframes esi-stack-float{50%{translate:0 calc(var(--esi-k,1)*-2.5px)}}@keyframes esi-stack-spread{50%{translate:calc((var(--esi-n) - 1)*var(--esi-k,1)*3px) calc((var(--esi-n) - 1)*var(--esi-k,1)*1.33px)}}@keyframes esi-stack-pulse{50%{opacity:1}}@keyframes esi-record-spread{50%{translate:0 calc((var(--esi-n) - 1)*3px)}}@keyframes esi-record-pulse{50%{opacity:0.4}}@keyframes esi-cube-spread{50%{translate:calc((var(--esi-n) - 1)*4px) calc((var(--esi-n) - 1)*-2.3px)}}@keyframes esi-cube-pulse{50%{opacity:0.35}}@keyframes esi-dot{50%{opacity:0.32}}@keyframes esi-insert{50%{translate:6px -3px}}@keyframes esi-swing{25%{rotate:5deg}75%{rotate:-5deg}}@keyframes esi-fade{50%{opacity:0.3}}@keyframes esi-write{0%{stroke-dashoffset:1;opacity:0;animation-timing-function:step-end}4%{stroke-dashoffset:1;opacity:1;animation-timing-function:steps(9,start)}26%,86%{stroke-dashoffset:0;opacity:1}92%,to{stroke-dashoffset:0;opacity:0}}@keyframes esi-write-next{0%{stroke-dashoffset:1;opacity:0;animation-timing-function:step-end}30%{stroke-dashoffset:1;opacity:1;animation-timing-function:steps(5,start)}42%,86%{stroke-dashoffset:0;opacity:1}92%,to{stroke-dashoffset:0;opacity:0}}@keyframes esi-send{48%{translate:0 0}51%{translate:0 -2.5px}57%{translate:0 0}}@keyframes esi-feed{0%{translate:0 0;opacity:0}15%,85%{opacity:1}100%{translate:-38px 19px;opacity:0}}@keyframes esi-ping{0%{translate:0 0;opacity:0}20%,80%{opacity:1}100%{translate:10px 5px;opacity:0}}@keyframes esi-reply{0%,55%{opacity:0;translate:0 0}59%{opacity:1;translate:0 0}63%{translate:0 -2.5px}67%{translate:0 0}75%{translate:0 -2.5px}79%{translate:0 0}86%{opacity:1}92%,to{opacity:0}}@keyframes esi-answer{55%,92%{stroke-opacity:0.4;stroke-dasharray:2 2}60%,86%{stroke-opacity:0.65;stroke-dasharray:2 0}}";
const variantLoop =
  "[animation:var(--esi-loop,none)_3.6s_cubic-bezier(0.77,0,0.175,1)_calc(var(--esi-step,0ms)*var(--esi-n))_infinite]";
const stackLoop = `in-data-[loop=float]:[--esi-loop:esi-stack-float] in-data-[loop=float]:[--esi-step:180ms] in-data-[loop=spread]:[--esi-loop:esi-stack-spread] in-data-[loop=pulse]:[--esi-loop:esi-stack-pulse] in-data-[loop=pulse]:[--esi-step:450ms] ${variantLoop}`;
const recordLoop = `in-data-[loop=float]:[--esi-loop:esi-lift] in-data-[loop=float]:[--esi-step:200ms] in-data-[loop=spread]:[--esi-loop:esi-record-spread] ${variantLoop}`;
const recordLine =
  "fill-current [fill-opacity:0.2] in-data-[loop=pulse]:animate-[esi-record-pulse_2.4s_cubic-bezier(0.77,0,0.175,1)_calc(var(--esi-n)*300ms)_infinite]";
const cubeVariants =
  "in-data-[loop=float]:[--esi-loop:esi-lift] in-data-[loop=float]:[--esi-step:200ms] in-data-[loop=spread]:[--esi-loop:esi-cube-spread] in-data-[loop=pulse]:[--esi-loop:esi-cube-pulse] in-data-[loop=pulse]:[--esi-step:450ms]";
const orders = ["[--esi-n:0]", "[--esi-n:1]", "[--esi-n:2]"];
const layerOutline =
  "M42.2538 2.046C41.4408 1.6325 40.3965 1.6677 39.2612 2.2424L7.9616 18.1934C5.3895 19.5039 3.301 23.1064 3.301 26.2322V64.3226C3.301 66.0677 3.9458 67.2943 4.962 67.8199L1.8363 66.229C0.8201 65.7104 0.1753 64.4771 0.1753 62.732V24.6412C0.1753 21.5085 2.2638 17.913 4.8359 16.6024L36.1355 0.6515C37.2778 0.0698 38.322 0.0416 39.128 0.4551L42.2538 2.046Z";
const layerFace =
  "M42.2545 2.0456C43.2707 2.5643 43.9155 3.7979 43.9155 5.543V43.6337C43.9155 46.7665 41.827 50.3616 39.2549 51.6722L7.9554 67.6235C6.813 68.2052 5.7687 68.2331 4.9628 67.8196C3.9465 67.301 3.3018 66.0673 3.3018 64.3222V26.2318C3.3018 23.0991 5.3903 19.5036 7.9624 18.193L39.2619 2.2421C40.4043 1.6604 41.4486 1.6321 42.2545 2.0456Z";
const layers = [
  { x: 0, y: 0, opacity: 0.4, strokeOpacity: 0.2, order: "[--esi-n:0]" },
  { x: 13.65, y: 6.04, opacity: 0.6, strokeOpacity: 0.2, order: "[--esi-n:1]" },
  { x: 27.32, y: 12.08, opacity: 0.8, strokeOpacity: 0.3, order: "[--esi-n:2]" },
];

const shadeTop = "fill-[color-mix(in_srgb,currentColor_9%,var(--es-surface,transparent))]";
const shadeLeft = "fill-[color-mix(in_srgb,currentColor_5%,var(--es-surface,transparent))]";
const shadeRight = "fill-[color-mix(in_srgb,currentColor_2%,var(--es-surface,transparent))]";

function iso(x: number, y: number, z: number) {
  return `${80 + x - y},${48 + (x + y) / 2 - z}`;
}

function isoRect(x: number, y: number, z: number, w: number, d: number) {
  return `${iso(x, y, z)} ${iso(x + w, y, z)} ${iso(x + w, y + d, z)} ${iso(x, y + d, z)}`;
}

function isoLine(x1: number, y1: number, x2: number, y2: number, z: number) {
  return `M${iso(x1, y1, z)}L${iso(x2, y2, z)}`;
}

type IsoBoxProps = {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  ghost?: boolean;
  className?: string;
  children?: ReactNode;
};

function IsoBox({ x, y, z = 0, w, d, h, ghost = false, className = "", children }: IsoBoxProps) {
  const top = isoRect(x, y, z + h, w, d);

  if (ghost) {
    return (
      <g className={className} strokeOpacity="0.4" strokeWidth="0.6" strokeDasharray="2 2">
        <polygon points={top} />
        <path
          d={`M${iso(x, y + d, z + h)}L${iso(x, y + d, z)}L${iso(x + w, y + d, z)}L${iso(x + w, y, z)}L${iso(x + w, y, z + h)}M${iso(x + w, y + d, z + h)}L${iso(x + w, y + d, z)}`}
        />
        {children}
      </g>
    );
  }

  return (
    <g className={className} strokeOpacity="0.5" strokeWidth="0.75">
      <polygon
        className={shadeLeft}
        points={`${iso(x, y + d, z + h)} ${iso(x + w, y + d, z + h)} ${iso(x + w, y + d, z)} ${iso(x, y + d, z)}`}
      />
      <polygon
        className={shadeRight}
        points={`${iso(x + w, y, z + h)} ${iso(x + w, y + d, z + h)} ${iso(x + w, y + d, z)} ${iso(x + w, y, z)}`}
      />
      <polygon className={shadeTop} points={top} />
      {children}
    </g>
  );
}

const tileLines = [0, 1, 2, 3].flatMap((n) => [
  { x1: 80 + 14 * n, y1: 27 + 7 * n, x2: 38 + 14 * n, y2: 48 + 7 * n },
  { x1: 80 - 14 * n, y1: 27 + 7 * n, x2: 122 - 14 * n, y2: 48 + 7 * n },
]);
const columns = [
  { x: -30, height: 12, ghost: false },
  { x: -8, height: 28, ghost: true },
  { x: 14, height: 18, ghost: false },
];
const dropGuides = [
  { x: 52, y1: 32, y2: 64 },
  { x: 108, y1: 36, y2: 68 },
  { x: 84, y1: 48, y2: 80 },
];

export function FolderIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function KeyIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </svg>
  );
}

export function BuildingIcon(props: ComponentPropsWithoutRef<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 12h4" />
      <path d="M10 8h4" />
      <path d="M14 21v-3a2 2 0 0 0-4 0v3" />
      <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    </svg>
  );
}

const sheets = [
  { z: -14, order: "[--esi-n:0]" },
  { z: -7, order: "[--esi-n:1]" },
  { z: 0, order: "[--esi-n:2]" },
];

export function RecordIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`h-24 w-52 text-current ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 208 96"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        className="block size-full overflow-visible"
      >
        <style>{keyframes}</style>
        <g transform="translate(24 0)">
          {sheets.map((sheet) => (
            <g key={sheet.z} className={`${sheet.order} ${recordLoop}`}>
              <IsoBox x={-38} y={-20} z={sheet.z} w={76} d={40} h={3} />
            </g>
          ))}
          <g className={`[--esi-n:2] ${recordLoop}`} stroke="none">
            <polygon
              className={`[--esi-n:0] ${recordLine}`}
              points={isoRect(-32, -12, 3, 12, 12)}
            />
            <polygon className={`[--esi-n:1] ${recordLine}`} points={isoRect(-14, -9, 3, 44, 4)} />
            <polygon
              className={`opacity-65 [--esi-n:2] ${recordLine}`}
              points={isoRect(-14, -1, 3, 28, 4)}
            />
            <path
              d={isoLine(-32, 6, 32, 6, 3)}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}

const projectCubes = [
  { x: -27, y: -27, order: "[--esi-n:0]" },
  { x: 0, y: -27, order: "[--esi-n:1]" },
  { x: -27, y: 0, order: "[--esi-n:2]" },
];

export function ProjectIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`h-32 w-54 text-current ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 220 140"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        className="block size-full overflow-visible"
      >
        <style>{keyframes}</style>
        <g transform="translate(30 30)">
          <IsoBox x={-32} y={-32} z={-3} w={59} d={59} h={3} />
          <path
            d={`${isoLine(-32, -2.5, 27, -2.5, 0)}${isoLine(-2.5, -32, -2.5, 27, 0)}`}
            strokeOpacity="0.14"
            strokeWidth="0.5"
          />
          {projectCubes.map((cube) => (
            <IsoBox
              key={`${cube.x}-${cube.y}`}
              className={`${cube.order} ${cubeVariants} ${variantLoop}`}
              x={cube.x}
              y={cube.y}
              w={22}
              d={22}
              h={22}
            />
          ))}
          <IsoBox
            className={`[--esi-n:3] in-data-loop:[--esi-march:esi-march] ${cubeVariants} [animation:var(--esi-loop,none)_3.6s_cubic-bezier(0.77,0,0.175,1)_calc(var(--esi-step,0ms)*var(--esi-n))_infinite,var(--esi-march,none)_1.6s_linear_infinite]`}
            x={0}
            y={0}
            w={22}
            d={22}
            h={22}
            ghost
          />
        </g>
      </svg>
    </div>
  );
}

export type IconStackProps = IllustrationProps & {
  icon?: ReactNode;
};

export function IconStack({ icon, loop = false, className = "", ...props }: IconStackProps) {
  return (
    <div
      {...props}
      className={`relative h-24 w-22 text-current ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 72 81" fill="none" className="size-full overflow-visible">
        <style>{keyframes}</style>
        <ellipse
          className="fill-current blur-[4px] [fill-opacity:0.055]"
          cx="36"
          cy="76"
          rx="30"
          ry="7"
        />
        {layers.map((layer) => (
          <g
            key={layer.x}
            className={`${layer.order} ${stackLoop}`}
            opacity={layer.opacity}
            transform={`translate(${layer.x} ${layer.y})`}
            stroke="currentColor"
            strokeOpacity={layer.strokeOpacity}
            strokeWidth="0.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="fill-(--es-surface)" d={layerOutline} />
            <path className="fill-(--es-surface)" d={layerFace} />
          </g>
        ))}
      </svg>
      {icon && (
        <div
          className={`pointer-events-none absolute top-[57%] left-[70%] flex text-(color:--es-muted) [transform:translate(-50%,-50%)_scaleX(0.9)_skewY(-26deg)] [--esi-k:1.185] [--esi-n:2] [&_svg]:size-5 ${stackLoop}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
}

export function SearchIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 96" fill="none" stroke="currentColor">
        <style>{keyframes}</style>
        {tileLines.map((line) => (
          <line
            key={`${line.x1}-${line.x2}`}
            {...line}
            strokeOpacity="0.16"
            strokeWidth="0.5"
            strokeLinecap="round"
          />
        ))}
        <g className="in-data-loop:animate-[esi-scan_8s_cubic-bezier(0.65,0,0.35,1)_infinite]">
          <polygon
            className={march}
            points="80,41 94,48 80,55 66,48"
            fill="currentColor"
            fillOpacity="0.05"
            strokeOpacity="0.6"
            strokeWidth="0.75"
            strokeDasharray="2 2"
            strokeLinejoin="round"
          />
          <circle
            cx="80"
            cy="48"
            r="17"
            fill="currentColor"
            fillOpacity="0.03"
            strokeOpacity="0.5"
            strokeWidth="0.9"
          />
          <path
            d="M70 39.5a13 13 0 0 1 8-4.4"
            strokeOpacity="0.25"
            strokeWidth="0.75"
            strokeLinecap="round"
          />
          <path d="M92.4 60.4 104 72" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

export function ChartIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 96" fill="none" stroke="currentColor" strokeLinejoin="round">
        <style>{keyframes}</style>
        <IsoBox x={-36} y={-20} z={-16} w={72} d={36} h={3} />
        <path
          d={`${isoLine(-36, -11, 36, -11, -13)}${isoLine(-36, 7, 36, 7, -13)}`}
          strokeOpacity="0.12"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
        {columns.map((column, index) => (
          <g key={column.x} className={`${orders[index]} ${wave}`}>
            <IsoBox
              className={column.ghost ? march : ""}
              x={column.x}
              y={-8}
              z={-13}
              w={14}
              d={14}
              h={column.height}
              ghost={column.ghost}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function UploadIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        <polygon points="74,45 122,69 86,87 38,63" strokeOpacity="0.16" strokeWidth="0.5" />
        <polygon
          className={march}
          points="76,52 108,68 84,80 52,64"
          strokeOpacity="0.4"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        {dropGuides.map((guide) => (
          <line
            key={guide.x}
            x1={guide.x}
            y1={guide.y1}
            x2={guide.x}
            y2={guide.y2}
            strokeOpacity="0.2"
            strokeWidth="0.5"
            strokeDasharray="0.5 2.5"
          />
        ))}
        <g className={lift}>
          <polygon
            points="76,20 108,36 84,48 52,32"
            fill="currentColor"
            fillOpacity="0.06"
            strokeOpacity="0.6"
            strokeWidth="0.75"
          />
          <path
            d="M73.6 28.4 91.2 37.2M68.2 31.1 82.6 38.3"
            strokeOpacity="0.3"
            strokeWidth="1.5"
          />
        </g>
      </svg>
    </div>
  );
}

const feed = [
  { y: -26, width: 30, ghost: true },
  { y: -7, width: 30, ghost: false },
  { y: 12, width: 20, ghost: false },
];

const days = [0, 1, 2, 3, 4, 5]
  .flatMap((column) => [0, 1, 2, 3].map((row) => ({ column, row })))
  .filter((day) => day.column !== 3 || day.row !== 1);
const calendarKeyframes =
  "@keyframes esi-calendar-pick{0%,18%,82%,100%{translate:0 8px;opacity:.55}30%{translate:0 -1px;opacity:1}34%,68%{translate:0 0;opacity:1}76%{translate:0 8px;opacity:.55}}@keyframes esi-calendar-slot{0%,18%,82%,100%{opacity:.3}30%,68%{opacity:.8}76%{opacity:.3}}";
const calendarPickup =
  "in-data-loop:animate-[esi-calendar-pick_4.8s_cubic-bezier(0.77,0,0.175,1)_infinite]";
const calendarSlot =
  "in-data-loop:animate-[esi-calendar-slot_4.8s_cubic-bezier(0.77,0,0.175,1)_infinite]";

export function ActivityIllustration({
  loop = false,
  className = "",
  ...props
}: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        {feed.map((card) => (
          <IsoBox
            key={card.y}
            className={card.ghost ? march : ""}
            x={-26}
            y={card.y}
            w={52}
            d={14}
            h={3}
            ghost={card.ghost}
          >
            {!card.ghost && (
              <>
                <polygon
                  points={isoRect(-21, card.y + 5, 3, 4, 4)}
                  fill="currentColor"
                  fillOpacity="0.5"
                  stroke="none"
                />
                <path
                  d={isoLine(-11, card.y + 7, -11 + card.width, card.y + 7, 3)}
                  strokeOpacity="0.25"
                  strokeWidth="2"
                />
              </>
            )}
          </IsoBox>
        ))}
        <path
          d={isoLine(-19, -19, -19, 19, 3)}
          strokeOpacity="0.3"
          strokeWidth="0.6"
          strokeDasharray="0.5 2.5"
        />
        <circle
          className="in-data-loop:animate-[esi-feed_4s_cubic-bezier(0.65,0,0.35,1)_infinite]"
          cx={80 - 19 + 19}
          cy={48 + (-19 - 19) / 2 - 3}
          r="1.6"
          fill="currentColor"
          fillOpacity="0.8"
          stroke="none"
        />
      </svg>
    </div>
  );
}

export function InboxIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        <IsoBox x={-30} y={-22} z={-18} w={60} d={44} h={10} />
        <g strokeOpacity="0.4" strokeWidth="0.6">
          <polygon
            className={shadeLeft}
            points={`${iso(-25, -17, -8)} ${iso(25, -17, -8)} ${iso(25, -17, -15)} ${iso(-25, -17, -15)}`}
          />
          <polygon
            className={shadeRight}
            points={`${iso(-25, -17, -8)} ${iso(-25, 17, -8)} ${iso(-25, 17, -15)} ${iso(-25, -17, -15)}`}
          />
          <polygon className={shadeRight} points={isoRect(-25, -17, -15, 50, 34)} />
        </g>
        <polygon
          className={march}
          points={isoRect(-14, -10, -15, 28, 20)}
          strokeOpacity="0.4"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <path
          d={`M${iso(-14, 10, 4)}L${iso(-14, 10, -15)}M${iso(14, 10, 4)}L${iso(14, 10, -15)}M${iso(14, -10, 4)}L${iso(14, -10, -15)}`}
          strokeOpacity="0.2"
          strokeWidth="0.5"
          strokeDasharray="0.5 2.5"
        />
        <g className={lift}>
          <IsoBox x={-14} y={-10} z={4} w={28} d={20} h={2}>
            <path
              d={`M${iso(-6, 1, 6)}L${iso(-1, 5, 6)}L${iso(6, -5, 6)}`}
              strokeOpacity="0.7"
              strokeWidth="1.2"
            />
          </IsoBox>
        </g>
      </svg>
    </div>
  );
}

export function CommentsIllustration({
  loop = false,
  className = "",
  ...props
}: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        <IsoBox
          className="in-data-loop:animate-[esi-answer_6.4s_ease-in-out_infinite]"
          x={2}
          y={-34}
          z={10}
          w={36}
          d={20}
          h={4}
          ghost
        >
          <path d={`M${iso(30, -14, 14)}L${iso(36, -6, 14)}L${iso(35, -14, 14)}`} />
        </IsoBox>
        {[0, 1, 2].map((dot) => (
          <polygon
            key={dot}
            className="in-data-loop:animate-[esi-reply_6.4s_ease-in-out_infinite_backwards]"
            style={{ animationDelay: `${dot * 140}ms` }}
            points={isoRect(10 + dot * 8, -25.5, 14, 3, 3)}
            fill="currentColor"
            fillOpacity="0.6"
            stroke="none"
          />
        ))}
        <g className="in-data-loop:animate-[esi-send_6.4s_ease-in-out_infinite]">
          <g strokeOpacity="0.5" strokeWidth="0.75">
            <polygon
              className={shadeLeft}
              points={`${iso(-32, 22, 4)} ${iso(-24, 30, 4)} ${iso(-24, 30, 0)} ${iso(-32, 22, 0)}`}
            />
            <polygon
              className={shadeRight}
              points={`${iso(-25, 22, 4)} ${iso(-24, 30, 4)} ${iso(-24, 30, 0)} ${iso(-25, 22, 0)}`}
            />
            <polygon
              className={shadeTop}
              points={`${iso(-32, 22, 4)} ${iso(-25, 22, 4)} ${iso(-24, 30, 4)}`}
            />
          </g>
          <IsoBox x={-36} y={-4} w={46} d={26} h={4}>
            <path
              className="in-data-loop:animate-[esi-write_6.4s_linear_infinite]"
              d={isoLine(-29, 5, 1, 5, 4)}
              pathLength="1"
              strokeOpacity="0.3"
              strokeWidth="2.5"
              strokeDasharray="1 2"
            />
            <path
              className="in-data-loop:animate-[esi-write-next_6.4s_linear_infinite]"
              d={isoLine(-29, 13, -11, 13, 4)}
              pathLength="1"
              strokeOpacity="0.3"
              strokeWidth="2.5"
              strokeDasharray="1 2"
            />
          </IsoBox>
        </g>
      </svg>
    </div>
  );
}

export function OfflineIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        <IsoBox x={-44} y={-8} z={-7} w={20} d={16} h={14}>
          <path
            d={`${isoLine(-24, -4, -24, 4, 2)}${isoLine(-24, -4, -24, 4, -1)}`}
            strokeOpacity="0.3"
          />
          <polygon
            points={isoRect(-37, -2, 7, 4, 4)}
            fill="currentColor"
            fillOpacity="0.7"
            stroke="none"
          />
        </IsoBox>
        <path
          className={march}
          d={isoLine(-24, 0, -13, 0, 0)}
          strokeOpacity="0.5"
          strokeDasharray="2 2"
        />
        <IsoBox x={-13} y={-2} z={-2} w={4} d={4} h={4} />
        <path
          className="in-data-loop:animate-[esi-fade_2.4s_cubic-bezier(0.77,0,0.175,1)_infinite]"
          d={isoLine(-7, 0, 7, 0, 0)}
          strokeOpacity="0.25"
          strokeWidth="0.6"
          strokeDasharray="0.5 3"
        />
        <circle
          className="in-data-loop:animate-[esi-ping_2.4s_cubic-bezier(0.65,0,0.35,1)_infinite]"
          cx={80 - 24}
          cy={48 - 12}
          r="1.4"
          fill="currentColor"
          fillOpacity="0.8"
          stroke="none"
        />
        <IsoBox x={9} y={-2} z={-2} w={4} d={4} h={4} />
        <path d={isoLine(13, 0, 24, 0, 0)} strokeOpacity="0.3" />
        <IsoBox x={24} y={-8} z={-7} w={20} d={16} h={14}>
          <path
            d={`${isoLine(44, -4, 44, 4, 2)}${isoLine(44, -4, 44, 4, -1)}`}
            strokeOpacity="0.3"
          />
          <polygon points={isoRect(31, -2, 7, 4, 4)} strokeOpacity="0.5" />
        </IsoBox>
      </svg>
    </div>
  );
}

export function TrashIllustration({ loop = false, className = "", ...props }: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        <polygon
          points="72,35 98,48 72,61 46,48"
          fill="currentColor"
          fillOpacity="0.04"
          strokeOpacity="0.55"
          strokeWidth="0.75"
        />
        <path d="M46 48V72L72 85L98 72V48M72 61V85" strokeOpacity="0.55" strokeWidth="0.75" />
        <path d="M72 35V47" strokeOpacity="0.2" strokeWidth="0.5" />
        <polygon
          className={march}
          points="72,43 82,48 72,53 62,48"
          strokeOpacity="0.4"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <g className={lift}>
          <polygon
            points="106,8 132,21 106,34 80,21"
            fill="currentColor"
            fillOpacity="0.06"
            strokeOpacity="0.55"
            strokeWidth="0.75"
          />
          <path d="M80 21V25L106 38L132 25V21M106 34V38" strokeOpacity="0.55" strokeWidth="0.75" />
        </g>
      </svg>
    </div>
  );
}

export function CalendarIllustration({
  loop = false,
  className = "",
  ...props
}: IllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{`${keyframes}${calendarKeyframes}`}</style>
        <path
          d="M82.5 24.1 81.8 19a1.4 1.4 0 0 1 2.8-.4l.8 5.4M117.5 41.6l-.7-5.1a1.4 1.4 0 0 1 2.8-.4l.8 5.4"
          strokeOpacity="0.35"
          strokeWidth="0.75"
        />
        <polygon
          points="69,17.2 141.6,53.5 91,78.8 18.4,42.5"
          fill="currentColor"
          fillOpacity="0.03"
          strokeOpacity="0.4"
          strokeWidth="0.75"
        />
        <path
          d="M18.4 42.5v4L91 82.8L141.6 57.5v-4M91 78.8v4"
          strokeOpacity="0.4"
          strokeWidth="0.75"
        />
        {days.map((day) => (
          <circle
            key={`${day.column}-${day.row}`}
            cx={69 + 11 * (day.column - day.row)}
            cy={26 + 5.5 * (day.column + day.row)}
            r="1"
            fill="currentColor"
            fillOpacity="0.3"
            stroke="none"
          />
        ))}
        <polygon
          className={calendarSlot}
          points="91,44.5 98,48 91,51.5 84,48"
          strokeOpacity="0.4"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <g className={calendarPickup}>
          <polygon
            points="91,34.5 98,38 91,41.5 84,38"
            fill="currentColor"
            fillOpacity="0.12"
            strokeOpacity="0.7"
            strokeWidth="0.75"
          />
          <path d="M84 38V48M98 38V48M91 41.5V51.5" strokeOpacity="0.2" strokeWidth="0.5" />
          <text
            x="91"
            y="38"
            transform="rotate(26.565 91 38)"
            fill="currentColor"
            fillOpacity="0.7"
            fontSize="4"
            fontWeight="500"
            textAnchor="middle"
            dominantBaseline="central"
            stroke="none"
          >
            12
          </text>
        </g>
      </svg>
    </div>
  );
}

export const keyIllustrationVariants = ["keyhole", "ring", "matrix"] as const;

export type KeyIllustrationVariant = (typeof keyIllustrationVariants)[number];

export type KeyIllustrationProps = IllustrationProps & {
  variant?: KeyIllustrationVariant;
};

const keyDots = [
  "..XXXX...............",
  ".XXXXXX..............",
  "XXX..XXX.............",
  "XX....XXXXXXXXXXXXXXX",
  "XX....XXXXXXXXXXXXXXX",
  "XXX..XXX.....XX.XX.XX",
  ".XXXXXX......XX.XX..X",
  "..XXXX...............",
].flatMap((row, y) => [...row].map((dot, x) => ({ x, y, lit: dot === "X" })));

function KeyholeKey() {
  return (
    <>
      <rect
        width="40"
        height="52"
        rx="6"
        transform="matrix(1 .5 0 1 84 3)"
        strokeOpacity="0.18"
        strokeWidth="0.5"
      />
      <g transform="matrix(1 .5 0 1 78 6)">
        <rect
          width="40"
          height="52"
          rx="6"
          fill="currentColor"
          fillOpacity="0.05"
          strokeOpacity="0.5"
          strokeWidth="0.75"
        />
        <path
          d="M17.2 27.2a5 5 0 1 1 5.6 0L24.5 38h-9Z"
          fill="currentColor"
          fillOpacity="0.08"
          strokeOpacity="0.6"
          strokeWidth="0.75"
        />
      </g>
      <g
        className="in-data-loop:animate-[esi-insert_3.2s_cubic-bezier(0.77,0,0.175,1)_infinite]"
        transform="matrix(-1 .5 0 1 86 46)"
      >
        <path
          className={march}
          d="M30 -2.5H0V2.5H6V6H10V2.5H14V5H18V2.5H30"
          strokeOpacity="0.55"
          strokeWidth="0.7"
          strokeDasharray="2 2"
        />
        <circle
          className={march}
          cx="40"
          cy="0"
          r="10"
          strokeOpacity="0.55"
          strokeWidth="0.7"
          strokeDasharray="2 2"
        />
        <circle cx="43" cy="0" r="3.2" strokeOpacity="0.35" strokeWidth="0.6" />
      </g>
    </>
  );
}

function RingKey() {
  return (
    <>
      <circle cx="80" cy="20" r="11" strokeOpacity="0.5" strokeWidth="0.75" />
      <g className="origin-[80px_20px] in-data-loop:animate-[esi-swing_4s_ease-in-out_infinite]">
        <circle
          className={march}
          cx="80"
          cy="40"
          r="10"
          strokeOpacity="0.55"
          strokeWidth="0.7"
          strokeDasharray="2 2"
        />
        <path
          className={march}
          d="M83 49.5V60H88V64H83V68H87V72H83V84L80 87L77 84V49.5"
          strokeOpacity="0.55"
          strokeWidth="0.7"
          strokeDasharray="2 2"
        />
        <circle cx="80" cy="36" r="3" strokeOpacity="0.35" strokeWidth="0.6" />
      </g>
    </>
  );
}

function MatrixKey() {
  return (
    <>
      {keyDots.map((dot) => (
        <circle
          key={`${dot.x}-${dot.y}`}
          className={
            dot.lit
              ? "in-data-loop:animate-[esi-fade_2.4s_cubic-bezier(0.77,0,0.175,1)_infinite]"
              : undefined
          }
          style={{ animationDelay: `${dot.x * 90}ms` }}
          cx={20 + dot.x * 6}
          cy={27 + dot.y * 6}
          r={dot.lit ? 1.2 : 0.7}
          fill="currentColor"
          fillOpacity={dot.lit ? 0.65 : 0.14}
          stroke="none"
        />
      ))}
    </>
  );
}

export function KeyIllustration({
  variant = "keyhole",
  loop = false,
  className = "",
  ...props
}: KeyIllustrationProps) {
  return (
    <div
      {...props}
      className={`${frame} ${className}`}
      data-loop={loop === true ? "float" : loop || undefined}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 160 96"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <style>{keyframes}</style>
        {variant === "keyhole" && <KeyholeKey />}
        {variant === "ring" && <RingKey />}
        {variant === "matrix" && <MatrixKey />}
      </svg>
    </div>
  );
}
