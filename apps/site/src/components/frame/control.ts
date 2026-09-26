/** Hover, focus and open states every secondary control shares. */
export const controlStates =
  "text-ink-500 transition-colors hover:bg-ink-900/7 hover:text-ink-900 focus-visible:bg-ink-900/7 focus-visible:text-ink-900 focus-visible:outline-none active:scale-100 aria-expanded:bg-ink-900/7 aria-expanded:text-ink-900";

/** Selected state for toggles, chips and the current page: a tint, never an inverted fill. */
export const controlSelected =
  "aria-pressed:bg-ink-900/12 aria-pressed:text-ink-900 aria-pressed:hover:bg-ink-900/12 aria-[current=page]:bg-ink-900/12 aria-[current=page]:text-ink-900";

/** Bordered secondary button on a surface. */
export const outlineButton = `caps inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-line bg-hy-card px-2.5 py-0 ${controlStates}`;

/** Borderless text or icon button. */
export const ghostButton = `caps inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 ${controlStates}`;

/** The one solid button per view: ink fill, hover and focus flip to the accent. */
export const primaryButton =
  "hy-primary caps inline-flex h-10 items-center justify-center gap-2 rounded-md border border-transparent bg-ink-900 px-[18px] text-surface transition-[transform,background-color,color] duration-120 ease-out hover:bg-accent hover:text-white focus-visible:bg-accent focus-visible:text-white active:scale-[0.97]";

/** Mono uppercase pill with a tinted background. */
export const badge = "caps inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem]";

/** Card recipe: flat, 1px line, 10px radius; `.hy-card` adds the lift and accent wash. */
export const card = "hy-card rounded-[10px] border border-line bg-hy-card";
