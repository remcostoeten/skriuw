import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { Notifier, notify, type NotifyInstance } from "@remcostoeten/notifier";
import { useShortcut } from "@remcostoeten/use-shortcut/react";

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
  instance = notify(request.message, options);

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
};

export function ToastHost({ visible = true, reduceMotion = false }: HostProps) {
  const [, rerender] = useState(0);
  const $ = useShortcut({ ignoreInputs: false });

  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    actionListeners.add(listener);
    return () => {
      actionListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (actionableToast === null) {
      return;
    }
    const binding = $.bind("mod+z").on(
      () => {
        const current = actionableToast;
        if (current === null) {
          return;
        }
        current.run();
        current.dismiss();
      },
      {
        description: "Undo latest notification action",
        preventDefault: true,
        except: "typing",
      },
    );
    return () => binding.unbind();
  });

  return (
    <div
      className="[&_:is([role=status],[role=alert],[role=alertdialog])>div>div:first-child]:pr-2.5!"
      style={{ display: visible ? undefined : "none" }}
    >
      {/* The in-app reduce-motion setting is authoritative over the OS
          heuristic (WebKitGTK reports reduce whenever GTK animations are
          globally off), mirroring the data-reduce-motion policy in base.css. */}
      <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
        <Notifier
          position="bottom-center"
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
