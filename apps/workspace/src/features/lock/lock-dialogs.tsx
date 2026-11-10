import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent, FormEvent, ReactNode } from "react";
import type { NoteLockKind } from "@skriuw/renderer-core/contracts/workspace";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import {
  SegmentedControl,
  settingsButton,
  settingsButtonPrimary,
  settingsFieldFocus,
} from "@/shared/ui/settings-controls";
import { cn } from "@/shared/styling/class-names";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { normalizeRecoveryCodeInput, recoveryCodeLooksComplete } from "@/shared/text/recovery-code";
import { registerLockDialog } from "./session/dialog-requests";
import {
  formatWait,
  hintRevealsSecret,
  normalizeHint,
  secretNoun,
  unlockPresentation,
  validateHint,
  validateSecret,
} from "./state/model";
import type { LockDialogRequest } from "./state/model";
import { changeNoteSecret, recoverNotes, setUpNoteLock, unlockNotes } from "./session/backend";

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
  function close() {
    setRequest(null);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={dialogTitle(request)}
      className="mx-auto mb-auto mt-[14dvh] w-[calc(100vw-1.5rem)] max-w-[460px]"
    >
      {request.kind === "setup" && <SetupLockBody store={store} onDone={request.onReady} />}
      {request.kind === "unlock" && <UnlockBody store={store} onDone={request.onReady} />}
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

const KIND_OPTIONS = [
  { value: "pin", label: "PIN" },
  { value: "passphrase", label: "Passphrase" },
] as const;

const bodyClass = "flex flex-col px-4";
const introClass = "m-0 pt-3.5 pb-2 text-xs leading-[1.5] text-theme-secondary";
const rowClass =
  "grid grid-cols-[124px_minmax(0,1fr)] items-start gap-x-5 border-b border-theme-divider/85 py-2.5 last:border-b-0 max-[480px]:grid-cols-1 max-[480px]:gap-y-1.5";
const rowLabelClass = "flex min-w-0 flex-col gap-[3px] pt-[5px] text-[13px] font-[450]";
const rowDetailClass = "text-xs font-normal leading-[1.45] text-theme-secondary";
const footerClass = "flex items-center justify-end gap-1.5 border-t border-theme-divider/85 py-3";
const errorClass = "m-0 text-xs leading-[1.45] text-destructive";
const primaryButtonClass = cn(settingsButton, settingsButtonPrimary);

function fieldClass(invalid: boolean): string {
  return cn(
    "min-h-[30px] w-full rounded-[7px] border border-border bg-background px-2.5 py-[5px] text-[12.5px] text-foreground placeholder:text-theme-dim disabled:opacity-55",
    settingsFieldFocus,
    invalid && "border-destructive/60 hover:border-destructive/60 focus-visible:border-destructive",
  );
}

type RowProps = {
  label: string;
  detail?: string;
  htmlFor?: string;
  stack?: boolean;
  children: ReactNode;
};

function LedgerRow({ label, detail, htmlFor, stack, children }: RowProps) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn(rowClass, stack && "grid-cols-1 gap-y-2")}>
      <Label
        htmlFor={htmlFor}
        className={cn(rowLabelClass, stack && "flex-row items-baseline justify-between gap-3 pt-0")}
      >
        {label}
        {detail ? <span className={rowDetailClass}>{detail}</span> : null}
      </Label>
      <div className="flex min-w-0 flex-col items-start gap-1.5">{children}</div>
    </div>
  );
}

type FieldName = "secret" | "confirm" | "hint";

type FormError = {
  field: FieldName | null;
  message: string;
};

type SecretFieldsValue = {
  kind: NoteLockKind;
  secret: string;
  confirm: string;
  hint: string;
};

type SecretFieldsProps = {
  idBase: string;
  value: SecretFieldsValue;
  onChange: (value: SecretFieldsValue) => void;
  error: FormError | null;
  autoFocus?: boolean;
};

function fieldId(idBase: string, field: FieldName): string {
  return `${idBase}-${field}`;
}

function focusErrorField(idBase: string, error: FormError): void {
  if (error.field) {
    document.getElementById(fieldId(idBase, error.field))?.focus();
  }
}

function SecretFields({ idBase, value, onChange, error, autoFocus = true }: SecretFieldsProps) {
  const noun = secretNoun(value.kind);
  const isPin = value.kind === "pin";

  function describe(field: FieldName) {
    const invalid = error?.field === field;
    return {
      id: fieldId(idBase, field),
      className: fieldClass(invalid),
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${fieldId(idBase, field)}-error` : undefined,
    };
  }

  function message(field: FieldName) {
    return error?.field === field ? (
      <p id={`${fieldId(idBase, field)}-error`} role="alert" className={errorClass}>
        {error.message}
      </p>
    ) : null;
  }

  return (
    <>
      <LedgerRow label="Type">
        <SegmentedControl
          label="Lock type"
          value={value.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => onChange({ ...value, kind, secret: "", confirm: "" })}
        />
      </LedgerRow>
      <LedgerRow
        label={isPin ? "PIN" : "Passphrase"}
        detail={isPin ? "At least 4 digits" : "At least 6 characters"}
        htmlFor={fieldId(idBase, "secret")}
      >
        <input
          {...describe("secret")}
          type="password"
          inputMode={isPin ? "numeric" : "text"}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value.secret}
          onChange={(event) => onChange({ ...value, secret: event.target.value })}
        />
        {message("secret")}
      </LedgerRow>
      <LedgerRow label="Repeat" htmlFor={fieldId(idBase, "confirm")}>
        <input
          {...describe("confirm")}
          type="password"
          inputMode={isPin ? "numeric" : "text"}
          autoComplete="new-password"
          aria-label={`Repeat the ${noun}`}
          value={value.confirm}
          onChange={(event) => onChange({ ...value, confirm: event.target.value })}
        />
        {message("confirm")}
      </LedgerRow>
      <LedgerRow
        label="Hint"
        detail="Shown after a wrong attempt"
        htmlFor={fieldId(idBase, "hint")}
      >
        <input
          {...describe("hint")}
          type="text"
          autoComplete="off"
          placeholder="Optional"
          value={value.hint}
          onChange={(event) => onChange({ ...value, hint: event.target.value })}
        />
        {message("hint")}
      </LedgerRow>
    </>
  );
}

function secretFieldsError(value: SecretFieldsValue): FormError | null {
  const secretError = validateSecret(value.kind, value.secret);
  if (secretError) {
    return { field: "secret", message: secretError };
  }
  if (value.secret !== value.confirm) {
    return { field: "confirm", message: `The two ${secretNoun(value.kind)} entries differ.` };
  }
  const hintError = validateHint(value.hint);
  if (hintError) {
    return { field: "hint", message: hintError };
  }
  if (hintRevealsSecret(value.hint, value.secret)) {
    return { field: "hint", message: `The hint contains the ${secretNoun(value.kind)} itself.` };
  }
  return null;
}

function formFailure(message: string): FormError {
  return { field: null, message };
}

function FormErrorText({ error }: { error: FormError | null }) {
  if (!error || error.field) {
    return null;
  }
  return (
    <p role="alert" className={cn(errorClass, "pt-1 pb-3")}>
      {error.message}
    </p>
  );
}

function selectContents(event: FocusEvent<HTMLElement>): void {
  window.getSelection()?.selectAllChildren(event.currentTarget);
}

type SetupProps = {
  store: RendererStore;
  onDone?: () => void;
};

function SetupLockBody({ store, onDone }: SetupProps) {
  const closeDialog = useDialogClose();
  const idBase = useId();
  const [value, setValue] = useState<SecretFieldsValue>({
    kind: "pin",
    secret: "",
    confirm: "",
    hint: "",
  });
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const problem = secretFieldsError(value);
    if (problem) {
      setError(problem);
      focusErrorField(idBase, problem);
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
      setError(formFailure(String(failure)));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCode !== null) {
    return (
      <div className={bodyClass}>
        <p className={introClass}>
          Your notes can be unlocked with this recovery code if you forget your{" "}
          {secretNoun(value.kind)}.
        </p>
        <div>
          <LedgerRow label="Recovery code" detail="Shown once and never stored" stack>
            <code
              ref={(element) => element?.focus()}
              tabIndex={0}
              aria-label="Recovery code"
              className={cn(
                "block w-full select-all rounded-[7px] border border-border bg-background px-2.5 py-2 text-center font-mono text-[12.5px] leading-[1.7] tracking-[0.08em] text-foreground [overflow-wrap:anywhere]",
                settingsFieldFocus,
              )}
              onFocus={selectContents}
            >
              {recoveryCode}
            </code>
            <p className={cn(rowDetailClass, "m-0")}>
              Without the {secretNoun(value.kind)} or this code, locked notes cannot be read again,
              not by you and not by anyone else.
            </p>
          </LedgerRow>
        </div>
        <div className={footerClass}>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              closeDialog();
              onDone?.();
            }}
          >
            I saved it
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={bodyClass} noValidate onSubmit={(event) => void submit(event)}>
      <p className={introClass}>
        One {secretNoun(value.kind)} protects every note you lock. Locked notes are encrypted on
        this device and left out of search, links, and history until unlocked.
      </p>
      <div>
        <SecretFields idBase={idBase} value={value} onChange={setValue} error={error} />
      </div>
      <FormErrorText error={error} />
      <div className={footerClass}>
        <button type="button" className={settingsButton} onClick={closeDialog}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Setting up…" : "Set up lock"}
        </button>
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
  const idBase = useId();
  const lock = useRendererSelector(store, selectNoteLock);
  const [phase, setPhase] = useState<"secret" | "recovery">("secret");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<FormError | null>(null);
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
      setError(formFailure(String(failure).replace(/^invalid workspace operation: /, "")));
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
      focusErrorField(idBase, problem);
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
      setError(formFailure(String(failure).replace(/^invalid workspace operation: /, "")));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "recovery") {
    const recoveryId = `${idBase}-recovery`;
    return (
      <form className={bodyClass} noValidate onSubmit={(event) => void submitRecovery(event)}>
        <p className={introClass}>
          Enter the recovery code shown when the lock was set up, then choose a new {noun}.
        </p>
        <div>
          <LedgerRow label="Recovery code" detail="Eight groups of four" htmlFor={recoveryId} stack>
            <input
              id={recoveryId}
              className={cn(fieldClass(false), "font-mono tracking-[0.08em]")}
              value={recoveryCode}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              onChange={(event) => setRecoveryCode(normalizeRecoveryCodeInput(event.target.value))}
            />
          </LedgerRow>
          <SecretFields
            idBase={idBase}
            value={replacement}
            onChange={setReplacement}
            error={error}
            autoFocus={false}
          />
        </div>
        <FormErrorText error={error} />
        <div className={cn(footerClass, "justify-between")}>
          <button
            type="button"
            className={settingsButton}
            onClick={() => {
              setError(null);
              setPhase("secret");
            }}
          >
            Back
          </button>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={busy || !recoveryCodeLooksComplete(recoveryCode)}
          >
            {busy ? "Unlocking…" : "Unlock and set new lock"}
          </button>
        </div>
      </form>
    );
  }

  const secretId = `${idBase}-unlock`;
  const problem = presentation.throttled
    ? `Too many attempts. Try again in ${formatWait(presentation.waitMs)}.`
    : (error?.message ?? null);
  const describedBy = [
    presentation.showHint ? "note-lock-hint" : null,
    problem ? `${secretId}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form className={bodyClass} noValidate onSubmit={(event) => void submitSecret(event)}>
      <p className={introClass}>
        Enter your {noun} to open locked notes. They stay open until you lock them again or the
        session relocks.
      </p>
      <div>
        <LedgerRow label={isPin ? "PIN" : "Passphrase"} htmlFor={secretId}>
          <input
            ref={inputRef}
            id={secretId}
            className={fieldClass(problem !== null)}
            type="password"
            inputMode={isPin ? "numeric" : "text"}
            autoComplete="current-password"
            autoFocus
            value={secret}
            disabled={presentation.throttled}
            aria-invalid={problem !== null || undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event) => setSecret(event.target.value)}
          />
          {problem ? (
            <p id={`${secretId}-error`} role="alert" className={errorClass}>
              {problem}
            </p>
          ) : null}
          {presentation.showHint && (
            <p id="note-lock-hint" className={cn(rowDetailClass, "m-0")}>
              Hint: {lock.hint}
            </p>
          )}
        </LedgerRow>
      </div>
      <div className={cn(footerClass, "justify-between")}>
        <button
          type="button"
          className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-xs text-theme-secondary underline-offset-2 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
          onClick={() => {
            setError(null);
            setPhase("recovery");
          }}
        >
          Forgot your {noun}?
        </button>
        <span className="flex gap-1.5">
          <button type="button" className={settingsButton} onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={busy || presentation.throttled || secret.length === 0}
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
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
  const idBase = useId();
  const lock = useRendererSelector(store, selectNoteLock);
  const [value, setValue] = useState<SecretFieldsValue>({
    kind: lock.kind ?? "pin",
    secret: "",
    confirm: "",
    hint: lock.hint ?? "",
  });
  const [error, setError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const problem = secretFieldsError(value);
    if (problem) {
      setError(problem);
      focusErrorField(idBase, problem);
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
      setError(formFailure(String(failure).replace(/^invalid workspace operation: /, "")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={bodyClass} noValidate onSubmit={(event) => void submit(event)}>
      <p className={introClass}>The recovery code from setup keeps working after the change.</p>
      <div>
        <SecretFields idBase={idBase} value={value} onChange={setValue} error={error} />
      </div>
      <FormErrorText error={error} />
      <div className={footerClass}>
        <button type="button" className={settingsButton} onClick={closeDialog}>
          Cancel
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "Saving…" : "Change lock"}
        </button>
      </div>
    </form>
  );
}
