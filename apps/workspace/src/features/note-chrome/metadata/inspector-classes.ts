import { cn } from "@/shared/styling/class-names";

export const inspectorTransition =
  "transition-[background-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";

export const inspectorPress = "active:scale-[0.97] motion-reduce:active:scale-100";

export const inspectorRowClass = cn(
  "flex w-full cursor-pointer items-center rounded-[var(--radius)] bg-transparent text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
  inspectorTransition,
);

export const inspectorQuietAction = cn(
  "inline-flex h-6 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md bg-transparent px-2 text-[11.5px] text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  inspectorTransition,
  inspectorPress,
);

export const inspectorIconButton = cn(
  "inline-flex size-6 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  inspectorTransition,
  inspectorPress,
);
