import { useEffect, useRef } from "react";
import { SkriuwLogo } from "@/shared/icons/static";

type Props = {
  openingSignIn: boolean;
  signInError: string | null;
  onContinueLocal: () => void;
  onSignIn: () => void;
  onWarmSignIn: () => void;
};

export function Onboarding({
  openingSignIn,
  signInError,
  onContinueLocal,
  onSignIn,
  onWarmSignIn,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  // autoFocus fires while the window is still hidden during the cold-start
  // reveal and does not stick on WebKitGTK, so claim focus once mounted and
  // again whenever the window gains focus with nothing focused.
  useEffect(() => {
    function claimFocus(): void {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        primaryRef.current?.focus();
      }
    }
    primaryRef.current?.focus();
    window.addEventListener("focus", claimFocus);
    return () => window.removeEventListener("focus", claimFocus);
  }, []);

  return (
    <div
      className="onboarding-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-description"
    >
      <div className="onboarding-card">
        <SkriuwLogo size={22} className="onboarding-logo" aria-hidden="true" />
        <h1 id="onboarding-title">Where your notes live</h1>
        <p id="onboarding-description">
          Notes stay on this device. Sign in only if you want the same workspace
          on another machine.
        </p>

        <div className="onboarding-actions">
          <button
            ref={primaryRef}
            type="button"
            className="onboarding-primary"
            onClick={onContinueLocal}
            autoFocus
          >
            Start writing
          </button>
          <button
            type="button"
            className="onboarding-secondary"
            onClick={onSignIn}
            onFocus={onWarmSignIn}
            onPointerEnter={onWarmSignIn}
            disabled={openingSignIn}
          >
            {openingSignIn ? "Opening sign in…" : "Sign in and sync"}
          </button>
        </div>

        {signInError ? (
          <p className="onboarding-error" role="alert">
            {signInError}
          </p>
        ) : null}

        <p className="onboarding-note">
          Sync is encrypted in transit, not end-to-end. Either way you can
          change it later in Account &amp; sync.
        </p>
      </div>
    </div>
  );
}
