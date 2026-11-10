import { useEffect, useRef, useState } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useCloudSession } from "@/features/auth/cloud-session";
import { openExternalUrl } from "@/platform/runtime/external-links";
import { CopyIcon, ExternalLinkIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import {
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsButtonDanger,
  settingsButtonPrimary,
  settingsFieldFocus,
} from "@/shared/ui/settings-controls";
import { showToast } from "@/shared/ui/toast";
import { startLiveSharePublisher } from "./live-shares";
import { registerNoteShareDialog } from "./share-dialog-controller";
import { publishNoteShare, revokeNoteShare, type NoteShare } from "./share-api";
import { shareableNote } from "./share-content";
import { sendWithShareImages } from "./share-images";
import {
  clearNoteShares,
  forgetNoteShare,
  loadNoteShares,
  noteSharesState,
  rememberNoteShare,
  useNoteShares,
} from "./share-registry";
import { startTrashedShareRevoker } from "./trashed-shares";

type HostProps = {
  store: RendererStore;
  onRequestSignIn: () => void;
};

const updatedFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Owns public note links for the signed-in account: loads the account's
 * shares, keeps live ones current, stops sharing notes moved to the trash,
 * and mounts the share dialog on request.
 */
export function NoteShareHost({ store, onRequestSignIn }: HostProps) {
  const { user } = useCloudSession();
  const userId = user?.id ?? null;
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => registerNoteShareDialog(setNoteId), []);

  useEffect(() => {
    if (userId === null) {
      clearNoteShares();
      return;
    }
    void loadNoteShares();
    const stopRevoker = startTrashedShareRevoker(store, { accountId: userId });
    const stopPublisher = startLiveSharePublisher(store);
    return () => {
      stopPublisher();
      stopRevoker();
    };
  }, [store, userId]);

  return (
    <Dialog
      open={noteId !== null}
      onOpenChange={(open) => !open && setNoteId(null)}
      title="Share note"
      className="mx-auto mb-auto mt-[14dvh] w-[calc(100vw-1.5rem)] max-w-[620px]"
    >
      {noteId !== null && (
        <ShareBody
          store={store}
          noteId={noteId}
          signedIn={userId !== null}
          onRequestSignIn={onRequestSignIn}
        />
      )}
    </Dialog>
  );
}

type BodyProps = {
  store: RendererStore;
  noteId: string;
  signedIn: boolean;
  onRequestSignIn: () => void;
};

const ledgerBody = "px-5 pb-1.5";
const liveLabel = "Keep the link up to date";
const liveDetail = "Edits appear a few seconds after you stop typing.";

function ShareBody({ store, noteId, signedIn, onRequestSignIn }: BodyProps) {
  const closeDialog = useDialogClose();
  const shares = useNoteShares();

  if (!signedIn) {
    return (
      <div className={ledgerBody}>
        <SettingsGroup id="link" title="Public link">
          <SettingsRow
            label="Sign in to share"
            detail="Public links are served from skriuw.com, so sharing needs a Skriuw account. Signing in does not turn on sync."
          >
            <button
              type="button"
              className={cn(settingsButton, settingsButtonPrimary)}
              onClick={() => {
                closeDialog();
                onRequestSignIn();
              }}
            >
              Sign in
            </button>
          </SettingsRow>
        </SettingsGroup>
      </div>
    );
  }

  const note = shareableNote(store.getState(), noteId);
  if (!note.ok) {
    return (
      <div className={ledgerBody}>
        <SettingsGroup id="link" title="Public link">
          <SettingsRow label="This note can't be shared" detail={note.reason} />
        </SettingsGroup>
      </div>
    );
  }
  if (shares.status === "failed") {
    return (
      <div className={ledgerBody}>
        <SettingsGroup id="link" title="Public link" hint={<NoteTitle title={note.title} />}>
          <SettingsRow
            label="Shared links could not be loaded"
            detail={
              <span className="text-destructive" role="alert">
                {shares.message}
              </span>
            }
          >
            <button type="button" className={settingsButton} onClick={() => void loadNoteShares()}>
              Try again
            </button>
          </SettingsRow>
        </SettingsGroup>
      </div>
    );
  }
  if (shares.status !== "ready") {
    return (
      <div className={ledgerBody}>
        <SettingsGroup id="link" title="Public link" hint={<NoteTitle title={note.title} />}>
          <SettingsRow label="Checking shared links…" />
        </SettingsGroup>
      </div>
    );
  }
  const share = shares.shares.get(noteId);
  return (
    <div className={ledgerBody}>
      {share ? (
        <SharedState store={store} noteId={noteId} title={note.title} share={share} />
      ) : (
        <UnsharedState store={store} noteId={noteId} title={note.title} />
      )}
    </div>
  );
}

type StateProps = {
  store: RendererStore;
  noteId: string;
  title: string;
};

function useShareAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (busy) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    const active = document.activeElement;
    if (trigger?.isConnected && (active === null || active === document.body)) trigger.focus();
  }, [busy]);

  async function run(action: () => Promise<void>) {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Sharing failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function useReclaimedFocus<TElement extends HTMLElement>() {
  const ref = useRef<TElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) ref.current?.focus();
  }, []);
  return ref;
}

async function publishCurrent(store: RendererStore, noteId: string, live: boolean) {
  const note = shareableNote(store.getState(), noteId);
  if (!note.ok) throw new Error(note.reason);
  const shares = noteSharesState();
  const existing = shares.status === "ready" ? shares.shares.get(noteId) : undefined;
  rememberNoteShare(
    await sendWithShareImages(note.images, new Set(existing?.imageIds), (images) =>
      publishNoteShare({ noteId, title: note.title, markdown: note.markdown, live, images }),
    ),
  );
}

type TitleProps = {
  title: string;
};

function NoteTitle({ title }: TitleProps) {
  return <span className="line-clamp-2 [overflow-wrap:anywhere]">{title}</span>;
}

type ErrorProps = {
  message: string | null;
};

function ShareError({ message }: ErrorProps) {
  if (message === null) return null;
  return (
    <span className="text-xs leading-[1.5] font-normal text-destructive" role="alert">
      {message}
    </span>
  );
}

function PrivacyGroup() {
  return (
    <SettingsGroup id="privacy" title="Privacy">
      <SettingsRow
        label="Readable on Skriuw's server"
        detail="The note's text and images are stored without end-to-end encryption, even when sync is encrypted."
      />
      <SettingsRow label="Left out" detail="Drawings, videos, and images over 4 MB." />
    </SettingsGroup>
  );
}

function UnsharedState({ store, noteId, title }: StateProps) {
  const [live, setLive] = useState(true);
  const { busy, error, run } = useShareAction();
  const groupRef = useReclaimedFocus<HTMLDivElement>();
  return (
    <>
      <div ref={groupRef} tabIndex={-1} className="outline-none">
        <SettingsGroup id="link" title="Public link" hint={<NoteTitle title={title} />}>
          <SettingsRow
            label="Not shared"
            detail="Anyone with the link can read this note on skriuw.com."
            notes={<ShareError message={error} />}
          >
            <button
              type="button"
              className={cn(settingsButton, settingsButtonPrimary)}
              disabled={busy}
              onClick={() => void run(() => publishCurrent(store, noteId, live))}
            >
              {busy ? "Creating link…" : "Create link"}
            </button>
          </SettingsRow>
          <SettingToggle label={liveLabel} detail={liveDetail} checked={live} onChange={setLive} />
        </SettingsGroup>
      </div>
      <PrivacyGroup />
    </>
  );
}

type SharedStateProps = StateProps & {
  share: NoteShare;
};

function SharedState({ store, noteId, title, share }: SharedStateProps) {
  const { busy, error, run } = useShareAction();
  const copyRef = useReclaimedFocus<HTMLButtonElement>();

  function copyLink() {
    navigator.clipboard
      ?.writeText(share.url)
      .then(() => showToast({ message: "Link copied" }))
      .catch(() => showToast({ message: "Couldn't copy the link" }));
  }

  return (
    <>
      <SettingsGroup id="link" title="Public link" hint={<NoteTitle title={title} />}>
        <SettingsRow label="Public link" hideLabel className="gap-2">
          <input
            readOnly
            value={share.url}
            aria-label="Public link"
            onFocus={(event) => event.target.select()}
            className={cn(
              "min-h-[30px] min-w-0 flex-1 rounded-[7px] border border-border bg-background px-2.5 py-[5px] font-mono text-[11.5px] text-foreground",
              settingsFieldFocus,
            )}
          />
          <button
            ref={copyRef}
            type="button"
            className={settingsButton}
            onClick={copyLink}
            aria-label="Copy link"
          >
            <CopyIcon size={13} aria-hidden="true" />
            Copy
          </button>
          <button
            type="button"
            className={cn(settingsButton, "w-[30px] justify-center px-0")}
            onClick={() => void openExternalUrl(share.url)}
            aria-label="Open link"
            title="Open link"
          >
            <ExternalLinkIcon size={13} aria-hidden="true" />
          </button>
        </SettingsRow>
        <SettingToggle
          label={liveLabel}
          detail={liveDetail}
          checked={share.live}
          disabled={busy}
          onChange={(live) => void run(() => publishCurrent(store, noteId, live))}
        />
        <SettingsRow
          label="Last published"
          detail={updatedFormat.format(new Date(share.updatedAt * 1_000))}
          notes={<ShareError message={error} />}
        >
          {!share.live && (
            <button
              type="button"
              className={cn(settingsButton, settingsButtonPrimary)}
              disabled={busy}
              onClick={() => void run(() => publishCurrent(store, noteId, false))}
            >
              {busy ? "Publishing…" : "Update shared copy"}
            </button>
          )}
        </SettingsRow>
      </SettingsGroup>
      <PrivacyGroup />
      <SettingsGroup id="stop" title="Stop sharing" tone="danger">
        <SettingsRow
          label="Remove the public link"
          detail="The link stops working for everyone who has it."
        >
          <button
            type="button"
            className={cn(settingsButton, settingsButtonDanger)}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await revokeNoteShare(share.id);
                forgetNoteShare(noteId);
              })
            }
          >
            Stop sharing
          </button>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
