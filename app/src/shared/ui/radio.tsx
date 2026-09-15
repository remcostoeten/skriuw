import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

const radioClass = cn(
  "relative m-0 size-4 flex-none cursor-pointer appearance-none rounded-full border-[1.5px] border-theme-secondary bg-background transition-colors duration-[120ms] motion-reduce:duration-[1ms]",
  "checked:border-success",
  "after:absolute after:left-1/2 after:top-1/2 after:size-2 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-success after:opacity-0 after:transition-opacity after:content-['']",
  "checked:after:opacity-100",
  "enabled:hover:border-ring",
  "disabled:cursor-default disabled:opacity-50",
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/75",
  "forced-colors:appearance-auto forced-colors:after:hidden",
);

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * The app's radio button, matching {@link Checkbox}. Grouping still comes from
 * a shared `name` and a `role="radiogroup"` container.
 */
export const Radio = forwardRef<HTMLInputElement, Props>(function Radio(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} type="radio" className={cn(radioClass, className)} {...rest} />;
});
