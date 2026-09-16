import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Notifier, notify, type NotifyInstance } from "@remcostoeten/notifier";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { useShortcutBinding } from "@remcostoeten/use-shortcut/react";
import { KeyCaps } from "@/shared/ui/key-caps";

export type ToastAction = {
  label: string;
  run: () => void;
};

export type ToastRequest = {
  message: string;
  action?: ToastAction;
  durationMs?: number;
};

type ActionableToast = {
  id: string;
  run: () => void;
  dismiss: () => void;
};

let actionableToast: ActionableToast | null = null;
const actionListeners = new Set<() => void>();

function publishActionChange(): void {
  for (const listener of actionListeners) {
    listener();
  }
}

function clearAction(id: string): void {
  if (actionableToast?.id !== id) {
    return;
  }
  actionableToast = null;
  publishActionChange();
}

export function toastActionIsAvailable(): boolean {
  return actionableToast !== null;
}

function undoKeys(): string[] {
  return detectPlatform() === "mac" ? ["⌘", "⇧", "Z"] : ["Ctrl", "Shift", "Z"];
}

/** Shows a notification through @remcostoeten/notifier. */
export function showToast(request: ToastRequest): void {
  let instance: NotifyInstance;
  const run = request.action?.run;
  const options = {
    duration: request.durationMs ?? 7_000,
    dismissible: true,
    ...(request.action && run
      ? {
          action: {
            label: request.action.label,
            onClick: () => {
              run();
              instance.dismiss();
            },
          },
        }
      : {}),
    onDismiss: (id: string) => clearAction(id),
  };
  const message =
    request.action && run ? (
      <span className="flex items-center gap-2">
        <span>{request.message}</span>
        <KeyCaps keys={undoKeys()} />
      </span>
    ) : (
      request.message
    );
  instance = notify(message, options);

  if (request.action && run) {
    actionableToast = {
      id: instance.id,
      run,
      dismiss: () => instance.dismiss(),
    };
    publishActionChange();
  }
}

type HostProps = {
  visible?: boolean;
  reduceMotion?: boolean;
  /** Distance from the bottom edge, so the stack can clear the compact tab bar. */
  offset?: string;
};

export function ToastHost({ visible = true, reduceMotion = false, offset }: HostProps) {
  const [, rerender] = useState(0);
  function undoLatestAction(): void {
    const current = actionableToast;
    if (current === null) {
      return;
    }
    current.run();
    current.dismiss();
  }

  useShortcutBinding("mod+shift+z", undoLatestAction, {
    description: "Undo latest notification action",
    disabled: actionableToast === null,
    preventDefault: true,
  }, { ignoreInputs: false });

  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    actionListeners.add(listener);
    return () => {
      actionListeners.delete(listener);
    };
  }, []);

  return (
    <div
      className="toast-host [&_:is([role=status],[role=alert],[role=alertdialog])>div>div:first-child]:pr-2.5!"
      style={{ display: visible ? undefined : "none" }}
    >
      {/* The in-app reduce-motion setting is authoritative over the OS
          heuristic (WebKitGTK reports reduce whenever GTK animations are
          globally off), mirroring the data-reduce-motion policy in base.css. */}
      <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
        <Notifier
          position="bottom-center"
          offset={offset}
          maxVisible={3}
          duration={7_000}
          pauseOnHover
          stack
          colorMode="auto"
          radius="rounded"
          border={{ enabled: true }}
        />
      </MotionConfig>
    </div>
  );
}
