import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

export type StartupScreenAction = {
  label: string;
  onSelect: () => void;
  variant?: "default" | "primary";
  disabled?: boolean;
};

export type StartupScreenProps = {
  icon: ReactNode;
  title: string;
  detail: string;
  hint?: string | null;
  actions?: readonly StartupScreenAction[];
};

/**
 * The surface the renderer falls back to when the workspace cannot open. It
 * paints before settings load, so it may only use tokens the boot-appearance
 * script has already put on the root element.
 */
export function StartupScreen({ icon, title, detail, hint, actions = [] }: StartupScreenProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-background px-6 text-foreground"
      role="alert"
    >
      <div className="w-full max-w-[380px] text-center">
        <div className="mx-auto mb-5 flex size-9 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
        <h1 className="text-[13px] font-[560] text-foreground/[0.92]">{title}</h1>
        <p className="mt-2 text-[12px] leading-[1.65] text-muted-foreground">{detail}</p>
        {actions.length === 0 ? null : (
          <div className="mt-6 flex items-center justify-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant}
                disabled={action.disabled}
                onClick={action.onSelect}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {hint ? (
          <p className="mt-5 text-[11px] leading-[1.6] text-muted-foreground/70">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
