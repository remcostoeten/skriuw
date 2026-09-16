import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { NoteLockKind } from "@/contracts/workspace";
import { Button } from "@/shared/ui/button";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { Radio } from "@/shared/ui/radio";
import { LockIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import {
  normalizeRecoveryCodeInput,
  recoveryCodeLooksComplete,
} from "@/features/settings/sections/sync-encryption";
import { registerLockDialog } from "./lock-dialog-controller";
import {
  formatWait,
  hintRevealsSecret,
  normalizeHint,
  secretNoun,
  unlockPresentation,
  validateHint,
  validateSecret,
} from "./lock-model";
import type { LockDialogRequest } from "./lock-model";
import { changeNoteSecret, recoverNotes, setUpNoteLock, unlockNotes } from "./lock-session";

type HostProps = {
  store: RendererStore;
};

/**
 * Mounts the lock dialogs on demand. Nothing renders or subscribes while no
 * request is open, and every dialog mounts fresh so no secret lingers in state.
 */
export function LockDialogHost({ store }: HostProps) {
  const [request, setRequest] = useState<LockDialogRequest | null>(null);
  useEffect(() => registerLockDialog(setRequest), []);
  if (request === null) {
    return null;
  }
  const close = () => setRequest(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={dialogTitle(request)}
      className="mx-auto mb-auto mt-[14vh] w-[calc(100vw-1.5rem)] max-w-sm"
    >
      {request.kind === "setup" && (
        <SetupLockBody store={store} onDone={request.then} />
      )}
      {request.kind === "unlock" && (
        <UnlockBody store={store} onDone={request.then} />
      )}
      {request.kind === "change" && <ChangeSecretBody store={store} />}
    </Dialog>
  );
}

function dialogTitle(request: LockDialogRequest): string {
  switch (request.kind) {
    case "setup":
      return "Lock notes";
    case "unlock":
      return "Unlock notes";
    case "change":
      return "Change lock";
  }
}

const fieldClass =
  "min-h-[32px] w-full rounded-lg border border-border bg-muted px-2.5 py-[6px] text-sm text-foreground outline-none focus-visible:border-foreground/30";
const labelClass = "flex flex-col gap-1 text-xs text-muted-foreground";
const bodyClass = "flex flex-col gap-4 px-4 py-4";

type SecretFieldsValue = {
  kind: NoteLockKind;
  secret: string;
  confirm: string;
  hint: string;
};

type SecretFieldsProps = {
  value: SecretFieldsValue;
  onChange: (value: SecretFieldsValue) => void;
  autoFocus?: boolean;
  showKind?: boolean;
};

function SecretFields({ value, onChange, autoFocus = true, showKind = true }: SecretFieldsProps) {
  const groupId = useId();
  const noun = secretNoun(value.kind);
  const isPin = value.kind === "pin";
  return (
    <>
      {showKind && (
        <div role="radiogroup" aria-label="Lock type" className="flex gap-4 text-sm">
          {(["pin", "passphrase"] as const).map((kind) => (
            <label key={kind} className="flex cursor-pointer items-center gap-2">
              <Radio
                name={groupId}
                checked={value.kind === kind}
                onChange={() => onChange({ ...value, kind, secret: "", confirm: "" })}
              />
              {kind === "pin" ? "PIN" : "Passphrase"}
            </label>
          ))}
        </div>
      )}
      <label className={labelClass}>
        {isPin ? "PIN (at least 4 digits)" : "Passphrase (at least 6 characters)"}
        <input
          className={fieldClass}
          type="password"
          inputMode={isPin ? "numeric" : "text"}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value.secret}
          onChange={(event) => onChange({ ...value, secret: event.target.value })}
        />
      </label>
      <label className={labelClass}>
        Repeat the {noun}
        <input
          className={fieldClass}
          type="password"
          inputMode={isPin ? "numeric" : "text"}
          autoComplete="new-password"
          value={value.confirm}
          onChange={(event) => onChange({ ...value, confirm: event.target.value })}
        />
      </label>
      <label className={labelClass}>
        Hint (optional, shown after a wrong attempt)
        <input
          className={fieldClass}
          type="text"
          autoComplete="off"
          value={value.hint}
          onChange={(event) => onChange({ ...value, hint: event.target.value })}
        />
      </label>
    </>
  );
}

function secretFieldsError(value: SecretFieldsValue): string | null {
  const secretError = validateSecret(value.kind, value.secret);
  if (secretError) {
    return secretError;
  }
  if (value.secret !== value.confirm) {
    return `The two ${secretNoun(value.kind)} entries differ.`;
  }
  const hintError = validateHint(value.hint);
  if (hintError) {
    return hintError;
  }
  if (hintRevealsSecret(value.hint, value.secret)) {
    return `The hint contains the ${secretNoun(value.kind)} itself.`;
  }
  return null;
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 text-xs text-destructive">
      {children}
    </p>
  );
}

type SetupProps = {
  store: RendererStore;
  onDone?: () => void;
};

function SetupLockBody({ store, onDone }: SetupProps) {
  const closeDialog = useDialogClose();
  const [value, setValue] = useState<SecretFieldsValue>({
    kind: "pin",
    secret: "",
    confirm: "",
    hint: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const problem = secretFieldsError(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const code = await setUpNoteLock(store, {
        kind: value.kind,
        secret: value.secret,
        hint: normalizeHint(value.hint),
      });
      setRecoveryCode(code);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCode !== null) {
    return (
      <div className={bodyClass}>
        <p className="m-0 text-sm text-foreground">
          Your notes can be unlocked with this recovery code if you forget your{" "}
          {secretNoun(value.kind)}. It is shown once and never stored.
        </p>
        <code className="block select-all rounded-lg border border-border bg-muted px-3 py-2 text-center font-mono text-sm tracking-widest">
          {recoveryCode}
        </code>
        <p className="m-0 text-xs text-muted-foreground">
          Without the {secretNoun(value.kind)} or this code, locked notes cannot be read again,
          not by you and not by anyone else.
        </p>
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              closeDialog();
              onDone?.();
            }}
          >
            I saved it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className={bodyClass} onSubmit={(event) => void submit(event)}>
      <p className="m-0 text-xs text-muted-foreground">
        One {secretNoun(value.kind)} protects every note you lock. Locked notes are encrypted on
        this device and left out of search, links, and history until unlocked.
      </p>
      <SecretFields value={value} onChange={setValue} />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex justify-end gap-2">
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Setting up…" : "Set up lock"}
        </Button>
      </div>
    </form>
  );
}

function selectNoteLock(state: RendererState) {
  return state.noteLock;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

type UnlockProps = {
  store: RendererStore;
  onDone?: () => void;
};

function UnlockBody({ store, onDone }: UnlockProps) {
  const closeDialog = useDialogClose();
  const lock = useRendererSelector(store, selectNoteLock);
  const [phase, setPhase] = useState<"secret" | "recovery">("secret");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [replacement, setReplacement] = useState<SecretFieldsValue>({
    kind: lock.kind ?? "pin",
    secret: "",
    confirm: "",
    hint: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useNow(lock.nextAttemptAt !== null);
  const presentation = unlockPresentation(lock, now);
  const noun = secretNoun(lock.kind);
  const isPin = lock.kind === "pin";

  async function submitSecret(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (secret.length === 0 || presentation.throttled) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlockNotes(store, secret);
      closeDialog();
      onDone?.();
    } catch (failure) {
      setSecret("");
      setError(String(failure).replace(/^invalid workspace operation: /, ""));
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent): Promise<void> {
    event.preventDefault();
    const problem = secretFieldsError(replacement);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recoverNotes(store, recoveryCode, {
        kind: replacement.kind,
        secret: replacement.secret,
        hint: normalizeHint(replacement.hint),
      });
      closeDialog();
      onDone?.();
    } catch (failure) {
      setError(String(failure).replace(/^invalid workspace operation: /, ""));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "recovery") {
    return (
      <form className={bodyClass} onSubmit={(event) => void submitRecovery(event)}>
        <p className="m-0 text-xs text-muted-foreground">
          Enter the recovery code shown when the lock was set up, then choose a new {noun}.
        </p>
        <label className={labelClass}>
          Recovery code
          <input
            className={cn(fieldClass, "font-mono tracking-widest")}
            value={recoveryCode}
            spellCheck={false}
            autoComplete="off"
            autoFocus
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            onChange={(event) => setRecoveryCode(normalizeRecoveryCodeInput(event.target.value))}
          />
        </label>
        <SecretFields value={replacement} onChange={setReplacement} autoFocus={false} />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-between gap-2">
          <Button onClick={() => setPhase("secret")}>Back</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !recoveryCodeLooksComplete(recoveryCode)}
          >
            {busy ? "Unlocking…" : "Unlock and set new lock"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className={bodyClass} onSubmit={(event) => void submitSecret(event)}>
      <div className="flex items-center gap-3 text-sm text-foreground">
        <LockIcon size={18} className="shrink-0 text-muted-foreground" />
        <span>Enter your {noun} to open locked notes.</span>
      </div>
      <label className={labelClass}>
        {isPin ? "PIN" : "Passphrase"}
        <input
          ref={inputRef}
          className={fieldClass}
          type="password"
          inputMode={isPin ? "numeric" : "text"}
          autoComplete="current-password"
          autoFocus
          value={secret}
          disabled={presentation.throttled}
          aria-describedby={presentation.showHint ? "note-lock-hint" : undefined}
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      {presentation.showHint && (
        <p id="note-lock-hint" className="m-0 text-xs text-muted-foreground">
          Hint: {lock.hint}
        </p>
      )}
      {presentation.throttled ? (
        <ErrorText>Too many attempts. Try again in {formatWait(presentation.waitMs)}.</ErrorText>
      ) : (
        error && <ErrorText>{error}</ErrorText>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            setError(null);
            setPhase("recovery");
          }}
        >
          Forgot your {noun}?
        </button>
        <span className="flex gap-2">
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || presentation.throttled || secret.length === 0}
          >
            {busy ? "Unlocking…" : "Unlock"}
          </Button>
        </span>
      </div>
    </form>
  );
}

type ChangeProps = {
  store: RendererStore;
};

function ChangeSecretBody({ store }: ChangeProps) {
  const closeDialog = useDialogClose();
  const lock = useRendererSelector(store, selectNoteLock);
  const [value, setValue] = useState<SecretFieldsValue>({
    kind: lock.kind ?? "pin",
    secret: "",
    confirm: "",
    hint: lock.hint ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const problem = secretFieldsError(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeNoteSecret(store, {
        kind: value.kind,
        secret: value.secret,
        hint: normalizeHint(value.hint),
      });
      closeDialog();
    } catch (failure) {
      setError(String(failure).replace(/^invalid workspace operation: /, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={bodyClass} onSubmit={(event) => void submit(event)}>
      <p className="m-0 text-xs text-muted-foreground">
        The recovery code from setup keeps working after the change.
      </p>
      <SecretFields value={value} onChange={setValue} />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex justify-end gap-2">
        <Button onClick={closeDialog}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Change lock"}
        </Button>
      </div>
    </form>
  );
}
