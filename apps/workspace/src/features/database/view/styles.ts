const transition =
  "transition-[background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]";

export const toolButtonClass = `inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-theme-secondary outline-none ${transition} hover:bg-theme-hover hover:text-foreground focus-visible:bg-theme-hover focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-theme-hover aria-expanded:text-foreground aria-pressed:text-foreground pointer-coarse:h-10`;

export const segmentGroupClass =
  "inline-flex shrink-0 items-center rounded-lg border border-border bg-theme-deep p-0.5";

export const segmentButtonClass = `inline-flex h-[22px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-theme-secondary outline-none ${transition} hover:text-foreground focus-visible:text-foreground aria-pressed:bg-theme-active aria-pressed:text-foreground pointer-coarse:h-9`;

export const menuItemClass = `flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-theme-secondary outline-none ${transition} hover:bg-theme-hover hover:text-foreground focus-visible:bg-theme-hover focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-40`;

export const panelInputClass = `h-7 w-full min-w-0 rounded-[7px] border border-border bg-background px-2 text-xs text-foreground outline-none ${transition} placeholder:text-theme-dim hover:border-theme-btn-outline focus-visible:border-ring`;

export const ghostSelectClass =
  "h-[26px] min-h-[26px] rounded-md border-transparent bg-transparent pl-2 pr-1.5 text-xs text-foreground hover:bg-theme-hover";

export const fieldSelectClass =
  "h-7 min-h-7 rounded-[7px] border-border bg-background pl-2 pr-1.5 text-xs text-foreground hover:border-theme-btn-outline";

export const iconButtonClass = `inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-md text-theme-secondary outline-none ${transition} hover:bg-theme-hover hover:text-foreground focus-visible:bg-theme-hover focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-30`;

export const quietActionClass = `inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md px-[9px] text-xs text-theme-secondary outline-none ${transition} hover:bg-theme-hover hover:text-foreground focus-visible:bg-theme-hover focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-40`;

export const chipClass =
  "inline-flex h-[22px] max-w-full min-w-0 items-center gap-1 rounded-md border border-theme-divider bg-theme-hover/55 pl-2 text-[11.5px] text-theme-secondary";

export const outlineButtonClass = `inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-theme-btn-outline bg-background px-2.5 text-xs text-foreground outline-none ${transition} hover:bg-theme-hover focus-visible:border-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 motion-reduce:active:scale-100 pointer-coarse:h-10`;
