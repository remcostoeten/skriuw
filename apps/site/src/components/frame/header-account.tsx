"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { appUrl } from "@/data/content";
import { type CloudAccount, useCloudSession } from "@/lib/cloud-session";
import { controlStates, primaryButton } from "@/components/frame/control";

const openAppButton = cn(primaryButton, "h-7 px-3");

function initialOf(account: CloudAccount | null) {
  const source = account?.name.trim() || account?.email.trim() || "";
  return source.charAt(0).toUpperCase();
}

function PersonGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
      <circle cx="8" cy="5.5" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.75 13.5c.8-2.4 2.8-3.75 5.25-3.75s4.45 1.35 5.25 3.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Props = {
  account: CloudAccount | null;
};

function AccountMenu({ account }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const initial = initialOf(account);
  const label = account ? `Account: ${account.name || account.email}` : "Account";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget))
          return;
        if (event.relatedTarget !== null) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          controlStates,
          "inline-flex size-7 items-center justify-center rounded-full border border-line bg-hy-card text-[12px] font-semibold text-ink-900",
        )}
      >
        {initial === "" ? <PersonGlyph /> : <span aria-hidden>{initial}</span>}
      </button>

      <div id={panelId} data-open={open} inert={!open} className="site-account-menu">
        <div className="border-b border-dashed border-line px-3 pt-2.5 pb-2">
          <p className="caps m-0 text-ink-400">Signed in</p>
          {account ? (
            <>
              {account.name ? (
                <p className="m-0 mt-1 truncate text-[13px] font-medium text-ink-900">
                  {account.name}
                </p>
              ) : null}
              <p className="m-0 truncate text-[12px] text-ink-500">{account.email}</p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[12px] text-ink-500">Skriuw cloud account</p>
          )}
        </div>
        <div className="p-1">
          <Link
            href={appUrl}
            onClick={() => setOpen(false)}
            className={cn(
              controlStates,
              "flex h-8 items-center rounded-md px-2 text-[13px] text-ink-900",
            )}
          >
            Open app
          </Link>
        </div>
      </div>
    </div>
  );
}

export function HeaderAccount() {
  const session = useCloudSession();

  if (session.status === "signed-out") {
    return (
      <Link href={appUrl} className={openAppButton}>
        Open the app
      </Link>
    );
  }

  return (
    <>
      <AccountMenu account={session.account} />
      <Link href={appUrl} className={openAppButton}>
        Open app
      </Link>
    </>
  );
}
