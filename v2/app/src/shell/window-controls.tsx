import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "../shared/lib/utils";
import { noop } from "../shared/lib/noop";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../shared/icons";

const appWindow = getCurrentWindow();

type ControlButtonProps = {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
};

function runWindowAction(action: () => Promise<void>) {
  return () => {
    void action().catch(noop);
  };
}

function ControlButton({ label, onClick, className, children }: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-9 items-center justify-center text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The window runs with `decorations: false`, so the OS chrome (minimize /
 * maximize / close) is replaced by this compact cluster pinned to the
 * top-right corner. The padding around the buttons is a Tauri drag region,
 * so the window can still be moved from here.
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      appWindow
        .isMaximized()
        .then((value) => {
          if (active) setIsMaximized(value);
        })
        .catch(noop);
    };
    refresh();
    const unlisten = appWindow.onResized(refresh);
    return () => {
      active = false;
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="fixed right-0 top-0 z-50 flex h-9 items-center gap-0.5 rounded-bl-lg border-b border-l border-sidebar-border/70 bg-sidebar pl-3 pr-1"
    >
      <ControlButton label="Minimize" onClick={runWindowAction(() => appWindow.minimize())}>
        <MinimizeIcon size={14} strokeWidth={1.75} />
      </ControlButton>
      <ControlButton
        label={isMaximized ? "Restore" : "Maximize"}
        onClick={runWindowAction(() => appWindow.toggleMaximize())}
      >
        {isMaximized ? (
          <RestoreIcon size={12} strokeWidth={1.75} />
        ) : (
          <MaximizeIcon size={12} strokeWidth={1.75} />
        )}
      </ControlButton>
      <ControlButton
        label="Close"
        onClick={runWindowAction(() => appWindow.close())}
        className="hover:bg-red-500/85 hover:text-white"
      >
        <CloseIcon size={14} strokeWidth={1.75} />
      </ControlButton>
    </div>
  );
}
