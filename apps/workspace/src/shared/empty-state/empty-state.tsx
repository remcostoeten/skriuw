"use client";

import {
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type PointerEvent,
  type ReactNode,
} from "react";

export type EmptyStateAction = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary";
};

export type EmptyStateGuide = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  id: string;
  label: ReactNode;
  href: string;
  icon?: ReactNode;
};

export type EmptyStateLink = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  label: ReactNode;
  href: string;
  icon?: ReactNode;
};

export type EmptyStateSize = "md" | "lg";

export type EmptyStateEntrance = "rise" | "fade" | "blur";

export type EmptyStateLoop = "float" | "spread" | "pulse";

export type EmptyStatePointer = "tilt" | "parallax";

export type EmptyStateColors = Partial<
  Record<"background" | "foreground" | "muted" | "border" | "surface", string>
>;

export type EmptyStateProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  illustration?: ReactNode;
  actions?: readonly EmptyStateAction[];
  link?: EmptyStateLink;
  guides?: readonly EmptyStateGuide[];
  guidesTitle?: ReactNode;
  size?: EmptyStateSize;
  animated?: boolean | EmptyStateEntrance;
  loop?: boolean | EmptyStateLoop;
  pointer?: boolean | EmptyStatePointer;
  theme?: "system" | "light" | "dark";
  colors?: EmptyStateColors;
  headingLevel?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  children?: ReactNode;
};

const root =
  "group/es box-border flex w-full min-w-0 flex-col items-center justify-center text-center font-[Geist,ui-sans-serif,system-ui,sans-serif] text-(color:--es-foreground) **:box-border [--es-background:var(--background,#fafafa)] [--es-border:var(--border,#d9d9d9)] [--es-ease-out:cubic-bezier(0.23,1,0.32,1)] [--es-foreground:var(--foreground,#0a0a0a)] [--es-muted:var(--muted-foreground,#6b6b6b)] [--es-surface:var(--es-background)] dark:[--es-background:var(--background,#0a0a0a)] dark:[--es-border:var(--border,#262626)] dark:[--es-foreground:var(--foreground,#ededed)] dark:[--es-muted:var(--muted-foreground,#8a8a8a)] data-[theme=light]:[--es-background:#fafafa] data-[theme=light]:[--es-border:#d9d9d9] data-[theme=light]:[--es-foreground:#0a0a0a] data-[theme=light]:[--es-muted:#6b6b6b] data-[theme=dark]:[--es-background:#0a0a0a] data-[theme=dark]:[--es-border:#262626] data-[theme=dark]:[--es-foreground:#ededed] data-[theme=dark]:[--es-muted:#8a8a8a] data-[animated=fade]:[--es-enter-distance:0px] data-[animated=blur]:[--es-enter-blur:4px] [&_:is(button,a):focus-visible]:outline-3 [&_:is(button,a):focus-visible]:outline-offset-2 [&_:is(button,a):focus-visible]:outline-(color:--es-foreground)/25";
const entrance =
  "group-data-animated/es:transition-[opacity,translate,filter] group-data-animated/es:duration-(--es-enter-duration,220ms) group-data-animated/es:ease-(--es-ease-out) starting:group-data-animated/es:opacity-0 starting:group-data-animated/es:translate-y-(--es-enter-distance,6px) starting:group-data-animated/es:blur-(--es-enter-blur,0px)";
const follow =
  "transition-transform duration-500 ease-(--es-ease-out) group-data-[pointer=tilt]/es:transform-[perspective(600px)_rotateX(calc(var(--es-py,0)*-10deg))_rotateY(calc(var(--es-px,0)*12deg))] group-data-[pointer=parallax]/es:transform-[translate3d(calc(var(--es-px,0)*10px),calc(var(--es-py,0)*8px),0)]";
const sizes = {
  md: {
    root: "min-h-[300px] gap-10 px-6 py-12 max-[480px]:px-4 max-[480px]:py-10",
    main: "gap-5",
    title: "text-base/[1.4] tracking-[-0.02em]",
    description: "max-w-96 text-balance",
    guides: "text-xs/normal",
  },
  lg: {
    root: "gap-24 px-5 py-12 max-[480px]:gap-16 max-[480px]:px-4 max-[480px]:py-8",
    main: "gap-6",
    title: "text-2xl/tight tracking-[-0.045em] max-[480px]:text-[22px]",
    description: "max-w-100 text-pretty",
    guides: "text-sm/normal",
  },
};

function colorTokens(colors: EmptyStateColors) {
  return Object.fromEntries(Object.entries(colors).map(([name, value]) => [`--es-${name}`, value]));
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function Action({
  label,
  icon,
  variant = "primary",
  className = "",
  ...action
}: Omit<EmptyStateAction, "id">) {
  return (
    <button
      type="button"
      {...action}
      data-variant={variant}
      className={`inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-(color:--es-foreground) px-4 py-2 font-[inherit] text-sm/none font-medium whitespace-nowrap text-(color:--es-background) transition-[background-color,scale] duration-[150ms,120ms] ease-[ease,var(--es-ease-out)] enabled:hover:bg-[color-mix(in_srgb,var(--es-foreground)_85%,var(--es-background))] enabled:active:scale-97 disabled:cursor-not-allowed disabled:opacity-50 data-[variant=secondary]:border-(color:--es-border) data-[variant=secondary]:bg-(color:--es-surface) data-[variant=secondary]:text-(color:--es-foreground) data-[variant=secondary]:enabled:hover:bg-[color-mix(in_srgb,var(--es-foreground)_4%,var(--es-surface))] ${className}`}
    >
      {icon && (
        <span className="inline-flex shrink-0 [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}

function Guide({ label, icon, className = "", ...guide }: Omit<EmptyStateGuide, "id">) {
  return (
    <a
      {...guide}
      className={`flex min-w-0 items-center gap-2.5 rounded-md border border-(color:--es-border) px-3.5 py-3 text-left text-(color:--es-foreground) no-underline transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--es-foreground)_4%,var(--es-surface))] ${className}`}
    >
      {icon && (
        <span
          className="inline-flex shrink-0 text-(color:--es-muted) [&_svg]:size-3.5"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 truncate">{label}</span>
      <svg
        className="ml-auto size-4 shrink-0 text-(color:--es-muted)"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </a>
  );
}

function HelpLink({ label, icon = <InfoIcon />, className = "", ...link }: EmptyStateLink) {
  return (
    <a
      {...link}
      className={`inline-flex items-center gap-1.5 rounded-sm text-xs/normal font-medium text-(color:--es-muted) no-underline transition-colors duration-150 ease-[ease] hover:text-(color:--es-foreground) [&_strong]:font-[inherit] [&_strong]:text-(color:--es-foreground) [&_svg]:size-3.5 [&_svg]:shrink-0 ${className}`}
    >
      <span className="inline-flex" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </a>
  );
}

export function EmptyState({
  title,
  description,
  illustration,
  actions = [],
  link,
  guides = [],
  guidesTitle,
  size = "md",
  animated = false,
  loop = false,
  pointer = false,
  theme = "system",
  colors = {},
  headingLevel: Heading = "h2",
  className = "",
  style,
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: EmptyStateProps) {
  const titleId = useId();
  const descriptionId = useId();
  const followRef = useRef<HTMLDivElement>(null);
  const scale = sizes[size];

  function moveFollow(x: number, y: number) {
    followRef.current?.style.setProperty("--es-px", x.toFixed(3));
    followRef.current?.style.setProperty("--es-py", y.toFixed(3));
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    onPointerMove?.(event);
    if (!pointer || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    moveFollow(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
    );
  }

  function handlePointerLeave(event: PointerEvent<HTMLElement>) {
    onPointerLeave?.(event);
    if (pointer) moveFollow(0, 0);
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...props}
      className={`${root} ${scale.root} ${className}`}
      style={{ ...colorTokens(colors), ...style }}
      data-animated={animated === true ? "rise" : animated || undefined}
      data-loop={loop === true ? "float" : loop || undefined}
      data-pointer={pointer === true ? "tilt" : pointer || undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-theme={theme === "system" ? undefined : theme}
    >
      <div className={`flex w-full flex-col items-center ${scale.main}`}>
        {illustration && (
          <div className={`flex justify-center ${entrance}`}>
            <div ref={followRef} className={follow}>
              {illustration}
            </div>
          </div>
        )}
        <div
          className={`flex flex-col items-center gap-2 group-data-animated/es:delay-(--es-enter-stagger,40ms) ${entrance}`}
        >
          <Heading id={titleId} className={`m-0 font-semibold text-balance ${scale.title}`}>
            {title}
          </Heading>
          {description && (
            <div
              id={descriptionId}
              className={`text-sm/relaxed text-(color:--es-muted) [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-4 ${scale.description}`}
            >
              {description}
            </div>
          )}
        </div>
        {(actions.length > 0 || Boolean(children)) && (
          <div
            className={`flex flex-wrap justify-center gap-2 group-data-animated/es:delay-[calc(var(--es-enter-stagger,40ms)*2)] ${entrance}`}
          >
            {actions.map(({ id, ...action }) => (
              <Action key={id} {...action} />
            ))}
            {children}
          </div>
        )}
        {link && (
          <div
            className={`flex justify-center group-data-animated/es:delay-[calc(var(--es-enter-stagger,40ms)*3)] ${entrance}`}
          >
            <HelpLink {...link} />
          </div>
        )}
      </div>
      {guides.length > 0 && (
        <div
          className={`w-full max-w-md group-data-animated/es:delay-[calc(var(--es-enter-stagger,40ms)*4)] ${scale.guides} ${entrance}`}
        >
          {guidesTitle && <p className="m-0 mb-3 text-(color:--es-muted)">{guidesTitle}</p>}
          <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
            {guides.map(({ id, ...guide }) => (
              <Guide key={id} {...guide} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
