import { SkriuwLogo } from "@/shared/icons";

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
