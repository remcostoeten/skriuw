const overlaySideMotion =
  "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1";

export const overlayContentMotion = [
  "will-change-[opacity,transform]",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
  "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
  "data-[state=open]:duration-150 data-[state=closed]:duration-100",
  "data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)]",
  "data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)]",
  overlaySideMotion,
  "motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100",
  "motion-reduce:data-[side=bottom]:slide-in-from-top-0 motion-reduce:data-[side=left]:slide-in-from-right-0 motion-reduce:data-[side=right]:slide-in-from-left-0 motion-reduce:data-[side=top]:slide-in-from-bottom-0",
].join(" ");
