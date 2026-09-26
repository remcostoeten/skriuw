import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Notifier, notify } from "@remcostoeten/notifier";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { useShortcutBinding } from "@remcostoeten/use-shortcut/react";
import { KeyCaps } from "@/shared/ui/key-caps";

export type ToastAction = {
  /** Button text. */
  label: string;
  /** Called when the action is pressed; the toast then dismisses. */
  run: () => void;
};

export type ToastRequest = {
  /** Main line of the toast. */
  message: string;
  /** Secondary line under the message. */
  description?: string;
  /** Optional button, e.g. Undo. */
  action?: ToastAction;
  /** Time before auto-dismiss, in milliseconds; defaults to 7000. */
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
  const hint = Boolean(request.action && run);
  const message =
    hint || request.description ? (
      <span className="flex flex-col items-start gap-1">
        <span className="text-pretty">{request.message}</span>
        {request.description ? (
          <span className="text-pretty text-[12px] font-normal leading-snug text-muted-foreground">
            {request.description}
          </span>
        ) : null}
        {hint ? <KeyCaps keys={undoKeys()} className="mt-1" /> : null}
      </span>
    ) : (
      request.message
    );
  const instance = notify(message, options);

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
  /** Hides the stack without dropping queued toasts. */
  visible?: boolean;
};

export function ToastHost({ visible = true }: HostProps) {
  const [, rerender] = useState(0);
  function undoLatestAction(): void {
    const current = actionableToast;
    if (current === null) {
      return;
    }
    current.run();
    current.dismiss();
  }

  useShortcutBinding(
    "mod+shift+z",
    undoLatestAction,
    {
      description: "Undo latest notification action",
      disabled: actionableToast === null,
      preventDefault: true,
    },
    { ignoreInputs: false },
  );

  useEffect(() => {
    function listener() {
      rerender((value) => value + 1);
    }
    actionListeners.add(listener);
    return () => {
      actionListeners.delete(listener);
    };
  }, []);

  return (
    <div
      className="toast-host [&_:is([role=status],[role=alert],[role=alertdialog])>div>div:first-child]:pr-2.5! [&_:is([role=status],[role=alert],[role=alertdialog])>div]:max-w-[min(420px,calc(100vw-32px))]!"
      style={{ display: visible ? undefined : "none" }}
    >
      {/* WebKitGTK reports prefers-reduced-motion whenever GTK animations are
          globally off, so the OS query is ignored and toasts always animate. */}
      <MotionConfig reducedMotion="never">
        <Notifier
          position="bottom-center"
          maxVisible={3}
          duration={7_000}
          pauseOnHover
          swipeToDismiss
          stack
          colorMode="auto"
          radius="rounded"
          border={{ enabled: true }}
        />
      </MotionConfig>
    </div>
  );
}
