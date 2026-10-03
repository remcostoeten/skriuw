import { useCallback, useRef, useState } from "react";
import { useCloudSession } from "@/features/auth/cloud-session";
import { useSignInNudge } from "@/features/auth/use-sign-in-nudge";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type SignIn = {
  signInOpen: boolean;
  signInMounted: boolean;
  openSignIn(returnToSettings: boolean): void;
  onSignInOpenChange(open: boolean): void;
};

/**
 * Owns the cloud sign-in drawer: opening it from any surface, returning to
 * settings when it was opened from there, and the nudge that offers it to a
 * signed-out browser visitor while no other overlay is open.
 */
export function useSignIn(
  store: RendererStore,
  setSettingsOpen: (open: boolean) => void,
  otherOverlayOpen: boolean,
): SignIn {
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMounted, setSignInMounted] = useState(false);
  const returnsToSettingsRef = useRef(false);
  const { user, isPending: authPending } = useCloudSession();
  // The sign-in drawer portals to <body>, which the modal settings <dialog>
  // renders inert and covers via the top layer — so settings must close first.
  const openSignIn = useCallback(
    (returnToSettings: boolean) => {
      returnsToSettingsRef.current = returnToSettings;
      setSettingsOpen(false);
      setSignInMounted(true);
      setSignInOpen(true);
    },
    [setSettingsOpen],
  );
  const overlayOpenRef = useRef(false);
  overlayOpenRef.current = signInOpen || otherOverlayOpen;
  useSignInNudge(store, isBrowserRuntime() && user === null && !authPending, () => {
    if (!overlayOpenRef.current) openSignIn(false);
  });
  const onSignInOpenChange = useCallback(
    (open: boolean) => {
      setSignInOpen(open);
      if (!open && returnsToSettingsRef.current) {
        returnsToSettingsRef.current = false;
        setSettingsOpen(true);
      }
    },
    [setSettingsOpen],
  );
  return { signInOpen, signInMounted, openSignIn, onSignInOpenChange };
}
