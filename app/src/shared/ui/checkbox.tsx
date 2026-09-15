import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

const checkboxClass = cn(
  "relative m-0 size-4 flex-none cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-theme-secondary bg-background transition-colors duration-[120ms] motion-reduce:duration-[1ms]",
  "checked:border-success checked:bg-success",
  "after:absolute after:left-[5px] after:top-[2px] after:h-2 after:w-1 after:rotate-45 after:border-b-[1.5px] after:border-r-[1.5px] after:border-background after:opacity-0 after:content-['']",
  "checked:after:opacity-100",
  "enabled:hover:border-ring",
  "disabled:cursor-default disabled:opacity-50",
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/75",
  "forced-colors:appearance-auto forced-colors:after:hidden",
);

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * The app's checkbox: a native `input[type=checkbox]` restyled to match the
 * editor's check items and the tasks view. Use it for boolean fields and
 * multi-select rows; the settings switch (`SettingToggle`) stays separate.
 */
export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} type="checkbox" className={cn(checkboxClass, className)} {...rest} />;
});
