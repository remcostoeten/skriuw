import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";

type TauriWindow = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (handler: () => void) => Promise<() => void>;
};

type TauriWindowApi = { getCurrentWindow: () => TauriWindow };

type TauriGlobal = { __TAURI__?: { window?: TauriWindowApi } };

function getTauriWindow(): TauriWindow | null {
  const api = (window as unknown as TauriGlobal).__TAURI__?.window;
  return api ? api.getCurrentWindow() : null;
}

type ControlButtonProps = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
};

function ControlButton({
  label,
  onClick,
  danger = false,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-11 items-center justify-center text-muted-foreground transition-colors",
        danger
          ? "hover:bg-red-500 hover:text-white"
          : "hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MinimizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect x="1.5" y="5" width="8" height="1" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="8"
        height="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="6.5"
        height="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M3.5 3V1.5H9.5V7.5H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path
        d="M1.5 1.5 L9.5 9.5 M9.5 1.5 L1.5 9.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WindowTitlebar() {
  const [tauriWindow] = useState<TauriWindow | null>(getTauriWindow);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!tauriWindow) return;
    let unlisten: (() => void) | undefined;
    let active = true;

    tauriWindow.isMaximized().then((value) => {
      if (active) setIsMaximized(value);
    });

    tauriWindow
      .onResized(() => {
        tauriWindow.isMaximized().then((value) => {
          if (active) setIsMaximized(value);
        });
      })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [tauriWindow]);

  return (
    <header
      data-tauri-drag-region=""
      className="flex h-9 w-screen shrink-0 select-none items-center border-b border-border bg-background pl-3"
    >
      {tauriWindow && (
        <div className="ml-auto flex h-full items-stretch">
          <ControlButton
            label="Minimize window"
            onClick={() => tauriWindow.minimize()}
          >
            <MinimizeIcon />
          </ControlButton>
          <ControlButton
            label={isMaximized ? "Restore window" : "Maximize window"}
            onClick={() => tauriWindow.toggleMaximize()}
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </ControlButton>
          <ControlButton
            label="Close window"
            danger
            onClick={() => tauriWindow.close()}
          >
            <CloseIcon />
          </ControlButton>
        </div>
      )}
    </header>
  );
}
