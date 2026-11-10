import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useRef, useState } from "react";
import { openExternalUrl } from "@/platform/runtime/commands";
import { ABOUT_LINKS, readAppVersion } from "@/features/settings-dialog/about/model";
import {
  checkForUpdate,
  describeUpdateOutcome,
  downloadPercentage,
  installPendingUpdate,
  type InstallProgress,
  type UpdateOutcome,
} from "@/features/updates/updater";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsRowDetail,
  settingsSection,
} from "@/shared/ui/settings-controls";

type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "checked"; outcome: UpdateOutcome }
  | { phase: "installing"; version: string; progress: InstallProgress }
  | { phase: "installFailed"; version: string; message: string };

function updateStatusText(state: UpdateState): string | null {
  if (state.phase === "checked") {
    return describeUpdateOutcome(state.outcome);
  }
  if (state.phase === "installing") {
    const percentage = downloadPercentage(state.progress);
    return percentage === null
      ? `Downloading version ${state.version}…`
      : `Downloading version ${state.version}… ${percentage}%`;
  }
  if (state.phase === "installFailed") {
    return `Version ${state.version} could not be installed: ${state.message}`;
  }
  return null;
}

function availableVersion(state: UpdateState): string | null {
  if (state.phase === "checked" && state.outcome.status === "available") {
    return state.outcome.version;
  }
  if (state.phase === "installFailed") {
    return state.version;
  }
  return null;
}

function checkButtonLabel(state: UpdateState): string {
  if (state.phase === "checking") {
    return "Checking…";
  }
  if (state.phase === "installing") {
    return "Installing…";
  }
  return settingsCopy.about.checkForUpdates;
}

export function AboutSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ phase: "idle" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    readAppVersion().then((value) => {
      if (mountedRef.current) {
        setVersion(value);
      }
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function runUpdateCheck(): void {
    setUpdate({ phase: "checking" });
    checkForUpdate().then((outcome) => {
      if (mountedRef.current) {
        setUpdate({ phase: "checked", outcome });
      }
    });
  }

  function runInstall(target: string): void {
    setUpdate({
      phase: "installing",
      version: target,
      progress: { downloadedBytes: 0, totalBytes: null },
    });
    installPendingUpdate((progress) => {
      if (mountedRef.current) {
        setUpdate({ phase: "installing", version: target, progress });
      }
    }).catch((error) => {
      if (mountedRef.current) {
        setUpdate({
          phase: "installFailed",
          version: target,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  const statusText = updateStatusText(update);
  const installable = availableVersion(update);

  return (
    <section aria-label="About" className={settingsSection}>
      <SettingsGroup id="version" title="Version" keywords="build update release changelog">
        <SettingsRow
          label="Skriuw"
          detail={
            <span className={settingsRowDetail}>
              {version === null ? "Reading…" : `Version ${version}`}
            </span>
          }
          notes={
            statusText ? (
              <span className={settingsRowDetail} role="status">
                {statusText}
              </span>
            ) : null
          }
        >
          {installable === null ? (
            <button
              type="button"
              className={settingsButton}
              disabled={update.phase === "checking" || update.phase === "installing"}
              onClick={runUpdateCheck}
            >
              {checkButtonLabel(update)}
            </button>
          ) : (
            <button
              type="button"
              className={settingsButton}
              onClick={() => runInstall(installable)}
            >
              {settingsCopy.about.installAndRestart}
            </button>
          )}
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        id="links"
        title="Links"
        keywords="repository source github report issue bug feedback license help"
      >
        <ul className="m-0 list-none p-0">
          {ABOUT_LINKS.map((link) => (
            <SettingsRow key={link.id} as="li" label={link.label} detail={link.description}>
              <button
                type="button"
                className={settingsButton}
                onClick={() => {
                  openExternalUrl(link.url).catch((error) => {
                    console.error(settingsCopy.about.openExternalUrlRejected, error);
                  });
                }}
              >
                Open
              </button>
            </SettingsRow>
          ))}
        </ul>
      </SettingsGroup>
    </section>
  );
}
