import {
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  DatabaseIcon,
  SkriuwLogo,
} from "../shared/icons";

type Props = {
  openingSignIn: boolean;
  signInError: string | null;
  onContinueLocal: () => void;
  onSignIn: () => void;
  onWarmSignIn: () => void;
};

const LOCAL_BENEFITS = ["Instant on every launch", "Private by default", "Export whenever you like"];

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
      <div className="onboarding-brand" aria-label="Skriuw">
        <SkriuwLogo size={25} aria-hidden="true" />
        <span>Skriuw</span>
      </div>

      <main className="onboarding-sheet">
        <section className="onboarding-intro">
          <div className="onboarding-paper-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="onboarding-eyebrow">Your workspace is ready</p>
          <h1 id="onboarding-title">A quiet place for everything you write.</h1>
          <p id="onboarding-description" className="onboarding-description">
            Start with no account and keep everything here, or sign in to carry
            your writing between devices.
          </p>
          <ul className="onboarding-benefits" aria-label="Local workspace benefits">
            {LOCAL_BENEFITS.map((benefit) => (
              <li key={benefit}>
                <CheckIcon size={14} aria-hidden="true" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="onboarding-choices" aria-label="Choose how to use Skriuw">
          <p className="onboarding-choice-label">Choose how to begin</p>
          <button
            type="button"
            className="onboarding-choice onboarding-choice-primary"
            onClick={onContinueLocal}
            autoFocus
          >
            <span className="onboarding-choice-icon" aria-hidden="true">
              <DatabaseIcon size={19} />
            </span>
            <span className="onboarding-choice-copy">
              <strong>Continue locally</strong>
              <span>Your workspace content stays on this device. No account needed.</span>
              <small>Recommended</small>
            </span>
            <ChevronRightIcon className="onboarding-choice-arrow" size={17} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="onboarding-choice onboarding-choice-secondary"
            onClick={onSignIn}
            onFocus={onWarmSignIn}
            onPointerEnter={onWarmSignIn}
            disabled={openingSignIn}
          >
            <span className="onboarding-choice-icon" aria-hidden="true">
              <CloudIcon size={19} />
            </span>
            <span className="onboarding-choice-copy">
              <strong>{openingSignIn ? "Opening sign in…" : "Sign in & sync"}</strong>
              <span>Keep a local copy and reach your workspace on other devices.</span>
              <small>Encrypted in transit · Not end-to-end encrypted yet</small>
            </span>
            <ChevronRightIcon className="onboarding-choice-arrow" size={17} aria-hidden="true" />
          </button>

          {signInError ? (
            <p className="onboarding-error" role="alert">{signInError}</p>
          ) : null}
          <p className="onboarding-later">
            You can change this later in <strong>Account &amp; sync</strong>.
          </p>
        </section>
      </main>
    </div>
  );
}
