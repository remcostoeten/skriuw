import { useEffect, useState } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { openExternalUrl } from "@/platform/runtime/external-links";
import { CopyIcon, ExternalLinkIcon } from "@/shared/icons/static";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { showToast } from "@/shared/ui/toast";
import { startLiveSharePublisher } from "./live-shares";
import { registerNoteShareDialog } from "./share-dialog-controller";
import { publishNoteShare, revokeNoteShare, type NoteShare } from "./share-api";
import { shareableNote } from "./share-content";
import {
  clearNoteShares,
  forgetNoteShare,
  loadNoteShares,
  rememberNoteShare,
  useNoteShares,
} from "./share-registry";

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
 * shares, keeps live ones current, and mounts the share dialog on request.
 */
export function NoteShareHost({ store, onRequestSignIn }: HostProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(() => registerNoteShareDialog(setNoteId), []);

  useEffect(() => {
    if (userId === null) {
      clearNoteShares();
      return;
    }
    void loadNoteShares();
    return startLiveSharePublisher(store);
  }, [store, userId]);

  return (
    <Dialog
      open={noteId !== null}
      onOpenChange={(open) => !open && setNoteId(null)}
      title="Share note"
      className="mx-auto mb-auto mt-[14dvh] w-[calc(100vw-1.5rem)] max-w-md"
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

function ShareBody({ store, noteId, signedIn, onRequestSignIn }: BodyProps) {
  const closeDialog = useDialogClose();
  const shares = useNoteShares();

  if (!signedIn) {
    return (
      <div className="flex flex-col gap-4 px-4 py-4 text-sm">
        <p className="text-muted-foreground">
          Public links are served from skriuw.com, so sharing needs a Skriuw account. Signing in
          does not turn on sync.
        </p>
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              closeDialog();
              onRequestSignIn();
            }}
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const note = shareableNote(store.getState(), noteId);
  if (!note.ok) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">{note.reason}</p>;
  }
  if (shares.status === "failed") {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 text-sm">
        <p className="text-destructive">{shares.message}</p>
        <div className="flex justify-end">
          <Button onClick={() => void loadNoteShares()}>Try again</Button>
        </div>
      </div>
    );
  }
  if (shares.status !== "ready") {
    return <p className="px-4 py-4 text-sm text-muted-foreground">Checking shared links…</p>;
  }
  const share = shares.shares.get(noteId);
  return share ? (
    <SharedState store={store} noteId={noteId} share={share} />
  ) : (
    <UnsharedState store={store} noteId={noteId} />
  );
}

type StateProps = {
  store: RendererStore;
  noteId: string;
};

function useShareAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
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

async function publishCurrent(store: RendererStore, noteId: string, live: boolean) {
  const note = shareableNote(store.getState(), noteId);
  if (!note.ok) throw new Error(note.reason);
  rememberNoteShare(
    await publishNoteShare({ noteId, title: note.title, markdown: note.markdown, live }),
  );
}

function UnsharedState({ store, noteId }: StateProps) {
  const [live, setLive] = useState(true);
  const { busy, error, run } = useShareAction();
  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-sm">
      <p className="text-muted-foreground">
        Anyone with the link can read this note on skriuw.com. Its text is stored on Skriuw's server
        without end-to-end encryption, even when sync is encrypted. Images and drawings are left
        out.
      </p>
      <label className="flex items-center gap-2.5">
        <Checkbox checked={live} onChange={(event) => setLive(event.target.checked)} />
        Keep the link up to date as I edit
      </label>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void run(() => publishCurrent(store, noteId, live))}
        >
          {busy ? "Creating link…" : "Create link"}
        </Button>
      </div>
    </div>
  );
}

type SharedStateProps = StateProps & {
  share: NoteShare;
};

function SharedState({ store, noteId, share }: SharedStateProps) {
  const { busy, error, run } = useShareAction();

  function copyLink() {
    navigator.clipboard
      ?.writeText(share.url)
      .then(() => showToast({ message: "Link copied" }))
      .catch(() => showToast({ message: "Couldn't copy the link" }));
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-sm">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={share.url}
          aria-label="Public link"
          onFocus={(event) => event.target.select()}
          className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-border bg-muted px-2.5 py-[6px] font-mono text-xs text-foreground outline-none focus-visible:border-foreground/30"
        />
        <Button onClick={copyLink} aria-label="Copy link">
          <CopyIcon size={13} aria-hidden="true" />
          Copy
        </Button>
        <Button onClick={() => void openExternalUrl(share.url)} aria-label="Open link">
          <ExternalLinkIcon size={13} aria-hidden="true" />
        </Button>
      </div>
      <label className="flex items-center gap-2.5">
        <Checkbox
          checked={share.live}
          disabled={busy}
          onChange={(event) => {
            const live = event.target.checked;
            void run(() => publishCurrent(store, noteId, live));
          }}
        />
        Keep the link up to date as I edit
      </label>
      <p className="text-xs text-muted-foreground">
        {share.live ? "Edits appear a few seconds after you stop typing. " : ""}
        Last published {updatedFormat.format(new Date(share.updatedAt * 1_000))}.
      </p>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex justify-between gap-2">
        <Button
          variant="danger"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await revokeNoteShare(share.id);
              forgetNoteShare(noteId);
            })
          }
        >
          Stop sharing
        </Button>
        {!share.live && (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void run(() => publishCurrent(store, noteId, false))}
          >
            {busy ? "Publishing…" : "Update shared copy"}
          </Button>
        )}
      </div>
    </div>
  );
}
