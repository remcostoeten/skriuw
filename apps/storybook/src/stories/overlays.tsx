import { useState } from "react";
import { Dialog } from "@/shared/ui/dialog";
import { Onboarding } from "@/features/onboarding/onboarding";
import dialogSource from "@/shared/ui/dialog.tsx?raw";
import { plainButton, Variant, type Story } from "@skriuw/storybook-shell";

type DemoDialog = "confirm" | "input" | "long" | "fullscreen" | "onboarding" | null;

const PHONE = { width: 390, height: 760 };

function DialogDemo() {
  const [open, setOpen] = useState<DemoDialog>(null);
  function close() {
    setOpen(null);
  }
  return (
    <div className="flex flex-wrap gap-2 p-4">
      <button type="button" className={plainButton} onClick={() => setOpen("confirm")}>
        Confirm
      </button>
      <button type="button" className={plainButton} onClick={() => setOpen("input")}>
        With input
      </button>
      <button type="button" className={plainButton} onClick={() => setOpen("long")}>
        Long content
      </button>
      <button type="button" className={plainButton} onClick={() => setOpen("fullscreen")}>
        Fullscreen
      </button>
      <button type="button" className={plainButton} onClick={() => setOpen("onboarding")}>
        Onboarding
      </button>

      <Dialog open={open === "confirm"} onOpenChange={close} title="Delete note">
        <div className="flex flex-col gap-4 p-4 text-[13px]">
          <p className="m-0 text-muted-foreground">
            "Weekly review" moves to the trash. You can restore it for 30 days.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={plainButton} onClick={close}>
              Cancel
            </button>
            <button type="button" className={plainButton} onClick={close}>
              Delete
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={open === "input"} onOpenChange={close} title="Go to date">
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <input
            autoFocus
            className="h-9 rounded-md border border-border bg-transparent px-2 text-[13px]"
            placeholder="next friday, 12 march…"
          />
          <button type="submit" className={plainButton}>
            Go
          </button>
        </form>
      </Dialog>

      <Dialog open={open === "long"} onOpenChange={close} title="Templates">
        <ul className="m-0 list-none p-2 text-[13px]">
          {Array.from({ length: 40 }, (_, index) => (
            <li key={index} className="rounded-md px-2 py-2 hover:bg-muted">
              Template {index + 1}
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={open === "fullscreen"}
        onOpenChange={close}
        title="Settings"
        className="dialog-fullscreen"
      >
        <p className="m-0 p-4 text-[13px] text-muted-foreground">
          Fullscreen dialogs keep the whole screen on a phone.
        </p>
      </Dialog>

      {open === "onboarding" ? (
        <Onboarding
          openingSignIn={false}
          signInError={null}
          onContinueLocal={close}
          onSignIn={close}
          onWarmSignIn={() => undefined}
        />
      ) : null}
    </div>
  );
}

/** Renders the demo alone, for the phone-sized frame. */
export function DialogFrame() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <DialogDemo />
    </div>
  );
}

function frameSource(theme: string | undefined) {
  const params = new URLSearchParams({ frame: "dialog" });
  if (theme) params.set("theme", theme);
  return `${window.location.pathname}?${params}`;
}

export const overlayStories: Story[] = [
  {
    id: "dialog",
    usage: `import { Dialog } from "@/shared/ui/dialog";

<Dialog open={open} onOpenChange={setOpen} title="Delete note">
  <div className="flex flex-col gap-4 p-4">…</div>
</Dialog>`,
    api: [{ source: dialogSource, type: "Props", label: "Dialog", file: "shared/ui/dialog.tsx" }],
    group: "Overlays",
    title: "Dialog",
    description:
      "Centered modal on wide screens; bottom sheet at 620px and below with pull-to-close. The palette and fullscreen dialogs opt out.",
    render: () => (
      <>
        <Variant label="Desktop">
          <DialogDemo />
        </Variant>
        <Variant label={`Phone (${PHONE.width}×${PHONE.height})`}>
          <iframe
            title="Dialog on a phone"
            src={frameSource(document.documentElement.dataset.theme)}
            width={PHONE.width}
            height={PHONE.height}
            className="rounded-[28px] border border-border"
          />
        </Variant>
      </>
    ),
  },
];
