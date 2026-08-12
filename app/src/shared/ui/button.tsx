import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[30px] cursor-pointer items-center justify-center gap-[7px] whitespace-nowrap rounded-[var(--radius)] border px-3 text-[11px] font-[560] [font-family:inherit] transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/55 text-foreground/[0.86]",
        primary: "border-foreground/20 bg-foreground/[0.12] text-foreground/[0.86]",
        danger:
          "border-border bg-muted/55 text-foreground/[0.86] hover:border-destructive/40 hover:bg-destructive/[0.12] hover:text-destructive",
        dangerFilled:
          "border-destructive/45 bg-destructive/[0.14] text-destructive hover:bg-destructive/25 hover:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, asChild = false, type, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...rest}
    />
  );
});

export { buttonVariants };
