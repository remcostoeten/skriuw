import assert from "node:assert/strict";
import test from "node:test";
import type { BridgePort, NoteLockSecretInput } from "../../../../../shared/renderer-core/src/bridge/port";
import { createMemoryBridge } from "../../../../../shared/renderer-core/src/bridge/memory-adapter";
import {
  WORKSPACE_PROTOCOL_VERSION,
  type NoteLockState,
  type SealedPayload,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../../../../../shared/renderer-core/src/contracts/workspace";
import type { RendererState } from "../../../../../shared/renderer-core/src/store/types";
import { createEditorHostSession } from "../../../editor/host-session";
import { EDITOR_PROTOCOL_VERSION, type HostToEditorMessage } from "../../../editor/protocol";
import { openWorkspaceSession, type ShellSession } from "../../../shell/workspace-session";
import { appPhase, createLockLifecycle } from "../lock-lifecycle";
import {
  classifyRevealError,
  createBiometricKeystore,
  createBiometricUnlock,
  createUnavailableBiometricKeystore,
  createUnavailableBiometrics,
  rearmBiometrics,
  type BiometricPort,
  type BiometricUnlock,
  type SecureStoreModule,
  type SecureStoreOptions,
} from "../biometrics";
import {
  autoLockMinutes,
  formatWait,
  isNodeLocked,
  isNoteSealed,
  lockErrorMessage,
  normalizeRecoveryCodeInput,
  recoveryCodeLooksComplete,
  retryWaitMs,
  secretDraftError,
  secretNoun,
  sealedNoteIds,
  unlockPresentation,
  validateHint,
  validateSecret,
} from "../lock-model";
import {
  changeNoteSecret,
  recoverNotes,
  relockNotes,
  removeLock,
  setNodeLocked,
  setUpNoteLock,
  toggleNodeLock,
  unlockNotes,
} from "../lock-session";
import type { AppPhase, Observable } from "../port";

const NOTE_ID = "note-diary";
const OPEN_NOTE_ID = "note-open";
const AT = Date.UTC(2026, 8, 20);
const SECRET = "4821";
const BODY = "# Diary\n\nThe part nobody else reads.\n";

const SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

const PLACEHOLDER_DOCUMENT = { type: "doc", content: [] };

const SEAL: SealedPayload = {
  scheme: "argon2id-xchacha20poly1305-v2",
  keyId: "key-1",
  nonce: "nonce-1",
  ciphertext: "ciphertext-1",
};

function node(id: string, title: string, rank: number): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId: null,
    rank,
    title,
    icon: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    pinnedAt: null,
  };
}

function snapshot(): WorkspaceSnapshot {
  return {
    protocolVersion: WORKSPACE_PROTOCOL_VERSION,
    activeNoteId: NOTE_ID,
    nodes: [node(NOTE_ID, "Diary", 1024), node(OPEN_NOTE_ID, "Groceries", 2048)],
    documents: [
      {
        noteId: NOTE_ID,
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: BODY,
        revision: 1,
        wordCount: 7,
      },
      {
        noteId: OPEN_NOTE_ID,
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "# Groceries\n",
        revision: 1,
        wordCount: 2,
      },
    ],
    historyHeaders: [],
    settings: SETTINGS,
    tags: [],
    people: [],
    references: [],
    tasks: [],
  };
}

/**
 * The retry schedule `unlock_retry_delay_ms` in `crates/skriuw-domain/src/lock.rs`
 * defines, restated here so this fake enforces exactly what the real storage
 * layer does. The client deliberately has no copy of it: it reads
 * `nextAttemptAt`, which is what these assertions therefore check.
 */
function unlockRetryDelayMs(failedAttempts: number): number | null {
  if (failedAttempts < 3) return null;
  if (failedAttempts === 3) return 30_000;
  if (failedAttempts === 4) return 120_000;
  if (failedAttempts === 5) return 600_000;
  return 1_800_000;
}

/**
 * The clock the attempt counter runs on, and the only one a test moves.
 * Operations keep the wall clock, the way the storage layer does, so a
 * generated write is never stamped behind the optimistic one it settles.
 */
type Clock = { now: number };

type LockingBridge = {
  bridge: BridgePort;
  clock: Clock;
  /** Plaintext bodies as the backend holds them, for assertions. */
  storedMarkdown: (noteId: string) => string;
};

/**
 * A bridge that seals bodies the way the SQLite adapter does: locking a note
 * writes ciphertext and replaces its plaintext columns with an empty document,
 * opened bodies are readable only while the session holds the key, and wrong
 * secrets are counted and delayed on the backend's own clock (ADR-0044).
 *
 * Built over the in-memory adapter rather than replacing it so everything that
 * is not the lock — operations, acknowledgements, snapshots — behaves exactly
 * as it does in the rest of the shell's tests.
 */
function createLockingBridge(): LockingBridge {
  const clock: Clock = { now: AT };
  const memory = createMemoryBridge({ snapshot: snapshot() });
  const sealed = new Set<string>();
  const plaintext = new Map<string, string>();
  let installed: { input: NoteLockSecretInput; recoveryCode: string } | null = null;
  let unlocked = false;
  let failedAttempts = 0;
  let nextAttemptAt: number | null = null;

  function state(): NoteLockState {
    if (installed === null) {
      return {
        configured: false,
        unlocked: false,
        kind: null,
        hint: null,
        failedAttempts: 0,
        nextAttemptAt: null,
        lockedNoteCount: 0,
      };
    }
    return {
      configured: true,
      unlocked,
      kind: installed.input.kind,
      hint: installed.input.hint,
      failedAttempts,
      nextAttemptAt: nextAttemptAt !== null && nextAttemptAt > clock.now ? nextAttemptAt : null,
      lockedNoteCount: sealed.size,
    };
  }

  function requireKey(action: string): void {
    if (installed === null || !unlocked) {
      throw new Error(`invalid workspace operation: ${action} needs the note lock open.`);
    }
  }

  function withhold(document: WorkspaceDocument): WorkspaceDocument {
    if (!sealed.has(document.noteId)) {
      return document;
    }
    return {
      ...document,
      documentJson: PLACEHOLDER_DOCUMENT,
      markdown: "",
      wordCount: 0,
      sealed: SEAL,
    };
  }

  async function documentsFor(ids: readonly string[]): Promise<WorkspaceDocument[]> {
    const delta = await memory.readWorkspaceDelta(ids);
    return delta.documents;
  }

  const bridge: BridgePort = {
    ...memory,

    bootstrapWorkspace: async () => {
      const loaded = await memory.bootstrapWorkspace();
      return { ...loaded, documents: loaded.documents.map(withhold) };
    },

    readWorkspaceDelta: async (ids) => {
      const delta = await memory.readWorkspaceDelta(ids);
      return { ...delta, documents: delta.documents.map(withhold) };
    },

    applyWorkspaceOperations: async (envelopes) => {
      // The adapter expands a lock before it applies: every covered body is
      // sealed first, and a device without the key refuses rather than
      // flagging plaintext as locked.
      for (const envelope of envelopes) {
        const operation = envelope.operation;
        if (operation.type !== "set_node_locked") {
          continue;
        }
        requireKey("Locking notes");
        const [document] = await documentsFor([operation.id]);
        if (operation.locked) {
          plaintext.set(operation.id, document?.markdown ?? "");
          sealed.add(operation.id);
        } else {
          sealed.delete(operation.id);
        }
      }
      return memory.applyWorkspaceOperations(envelopes);
    },

    noteLockState: async () => state(),

    configureNoteLock: async (input) => {
      if (installed !== null) {
        throw new Error("A note lock is already configured.");
      }
      installed = { input, recoveryCode: "ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567" };
      unlocked = true;
      return installed.recoveryCode;
    },

    unlockNoteLock: async (secret) => {
      if (installed === null) {
        throw new Error("No note lock is configured.");
      }
      if (nextAttemptAt !== null && nextAttemptAt > clock.now) {
        throw new Error(
          `invalid workspace operation: Too many attempts. Try again in ${Math.ceil((nextAttemptAt - clock.now) / 1_000)} seconds.`,
        );
      }
      if (installed.input.secret !== secret) {
        failedAttempts += 1;
        const delay = unlockRetryDelayMs(failedAttempts);
        nextAttemptAt = delay === null ? null : clock.now + delay;
        throw new Error("invalid workspace operation: That is not the right PIN.");
      }
      unlocked = true;
      failedAttempts = 0;
      nextAttemptAt = null;
      return state();
    },

    recoverNoteLock: async (recoveryCode, input) => {
      if (installed === null) {
        throw new Error("No note lock is configured.");
      }
      if (installed.recoveryCode !== recoveryCode) {
        throw new Error("invalid workspace operation: That recovery code does not match.");
      }
      installed = { ...installed, input };
      unlocked = true;
      failedAttempts = 0;
      nextAttemptAt = null;
      return state();
    },

    changeNoteLockSecret: async (input) => {
      requireKey("Changing the note lock");
      installed = { ...installed!, input };
      return state();
    },

    relockNoteLock: async () => {
      unlocked = false;
      return state();
    },

    readLockedDocuments: async (noteIds = null) => {
      requireKey("Reading locked notes");
      const ids = noteIds ?? [...sealed];
      const opened = await documentsFor(ids.filter((id) => sealed.has(id)));
      return opened.map((document) => ({
        ...document,
        markdown: plaintext.get(document.noteId) ?? document.markdown,
        sealed: null,
      }));
    },

    removeNoteLock: async () => {
      requireKey("Removing the note lock");
      const ids = [...sealed];
      sealed.clear();
      installed = null;
      unlocked = false;
      return memory.applyWorkspaceOperations(
        ids.map((id) => ({
          protocolVersion: WORKSPACE_PROTOCOL_VERSION,
          operation: { type: "set_node_locked", id, locked: false, at: Date.now() },
        })),
      );
    },
  };

  return { bridge, clock, storedMarkdown: (noteId) => plaintext.get(noteId) ?? "" };
}

async function withSession(
  bridge: BridgePort,
  run: (session: ShellSession) => Promise<void>,
): Promise<void> {
  const session = await openWorkspaceSession(bridge, (error) => {
    throw error;
  });
  try {
    await run(session);
  } finally {
    await session.close();
  }
}

const PIN: NoteLockSecretInput = { kind: "pin", secret: SECRET, hint: "the flat number" };

function markdownOf(state: RendererState, noteId: string): string {
  const record = state.documents.get(noteId);
  assert.ok(record, `document ${noteId} is loaded`);
  return record.markdown;
}

/** A biometric slot backed by a map, standing in for `expo-secure-store`. */
function fakeSecureStore(): SecureStoreModule & {
  entries: Map<string, string>;
  prompts: string[];
  fail: (error: Error | null) => void;
} {
  const entries = new Map<string, string>();
  const prompts: string[] = [];
  let failure: Error | null = null;
  return {
    entries,
    prompts,
    fail: (error) => {
      failure = error;
    },
    getItemAsync: async (key: string, options?: SecureStoreOptions) => {
      if (options?.requireAuthentication === true) {
        if (failure !== null) throw failure;
        prompts.push(options.authenticationPrompt ?? "");
      }
      return entries.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string) => {
      entries.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      entries.delete(key);
    },
  };
}

function fakeBiometrics(port: Partial<BiometricPort> = {}): BiometricPort {
  return {
    availability: async () => ({ available: true, kind: "fingerprint" }),
    ...port,
  };
}

function phaseSource(initial: AppPhase): Observable<AppPhase> & { set: (value: AppPhase) => void } {
  let value = initial;
  const listeners = new Set<(next: AppPhase) => void>();
  return {
    current: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

test("the secret rules are the backend's rules", () => {
  assert.equal(validateSecret("pin", "123"), "A PIN needs at least 4 digits.");
  assert.equal(validateSecret("pin", "12a4"), "A PIN contains digits only.");
  assert.equal(validateSecret("pin", "1234"), null);
  assert.equal(validateSecret("passphrase", " five "), "A passphrase needs at least 6 characters.");
  assert.equal(validateSecret("passphrase", "six is enough"), null);
  assert.match(validateSecret("passphrase", "é".repeat(200)) ?? "", /under 256 bytes/);
  assert.equal(validateHint("x".repeat(121)), "Keep the hint under 120 characters.");
  assert.equal(validateHint("x".repeat(120)), null);
});

test("a hint that contains the secret is refused, and the two entries must agree", () => {
  assert.equal(
    secretDraftError({ kind: "pin", secret: "4821", confirm: "4822", hint: "" }),
    "The two PIN entries differ.",
  );
  assert.equal(
    secretDraftError({ kind: "pin", secret: "4821", confirm: "4821", hint: "it is 4821" }),
    "The hint contains the PIN itself.",
  );
  assert.equal(
    secretDraftError({ kind: "pin", secret: "4821", confirm: "4821", hint: "flat number" }),
    null,
  );
  assert.equal(secretNoun("passphrase"), "passphrase");
  assert.equal(secretNoun(null), "PIN");
});

test("a lock recovery code is typed in the same groups as the sync one", () => {
  assert.equal(normalizeRecoveryCodeInput("abcd efgh"), "ABCD-EFGH");
  assert.equal(recoveryCodeLooksComplete("ABCD-EFGH"), false);
  assert.equal(recoveryCodeLooksComplete(normalizeRecoveryCodeInput("a".repeat(32))), true);
});

test("the hint stays hidden until the first miss", () => {
  const base: NoteLockState = {
    configured: true,
    unlocked: false,
    kind: "pin",
    hint: "the flat number",
    failedAttempts: 0,
    nextAttemptAt: null,
    lockedNoteCount: 2,
  };
  assert.equal(unlockPresentation(base, AT).showHint, false);
  assert.equal(unlockPresentation({ ...base, failedAttempts: 1 }, AT).showHint, true);
  assert.equal(unlockPresentation({ ...base, hint: null, failedAttempts: 3 }, AT).showHint, false);
});

test("the wait comes from the backend's own timestamp", () => {
  const throttled: NoteLockState = {
    configured: true,
    unlocked: false,
    kind: "pin",
    hint: null,
    failedAttempts: 4,
    nextAttemptAt: AT + 120_000,
    lockedNoteCount: 1,
  };
  assert.equal(retryWaitMs(throttled, AT), 120_000);
  assert.equal(retryWaitMs(throttled, AT + 300_000), 0);
  assert.equal(unlockPresentation(throttled, AT).throttled, true);
  assert.equal(unlockPresentation(throttled, AT + 300_000).throttled, false);
  assert.equal(formatWait(120_000), "2 minutes");
  assert.equal(formatWait(30_000), "30 seconds");
  assert.equal(formatWait(1), "1 second");
  assert.equal(formatWait(90_000), "2 minutes");
});

test("the operation prefix is stripped before a refusal is shown", () => {
  assert.equal(
    lockErrorMessage(new Error("invalid workspace operation: That is not the right PIN.")),
    "That is not the right PIN.",
  );
  assert.equal(lockErrorMessage("plain failure"), "plain failure");
});

test("the idle setting falls back to five minutes rather than to never", () => {
  assert.equal(autoLockMinutes(SETTINGS), 5);
  assert.equal(autoLockMinutes({ ...SETTINGS, autoLockMinutes: 0 }), 0);
  assert.equal(autoLockMinutes({ ...SETTINGS, autoLockMinutes: 15 }), 15);
  assert.equal(autoLockMinutes({ ...SETTINGS, autoLockMinutes: -1 }), 5);
  assert.equal(autoLockMinutes({ ...SETTINGS, autoLockMinutes: "soon" }), 5);
});

test("locking a note needs the lock set up first, then the key", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    assert.deepEqual(await setNodeLocked(session, NOTE_ID, true), { status: "needsSetup" });

    await setUpNoteLock(session, PIN);
    const locked = await toggleNodeLock(session, NOTE_ID);
    assert.deepEqual(locked, {
      status: "committed",
      kind: "note",
      title: "Diary",
      locked: true,
    });
    assert.equal(isNodeLocked(session.store.getState(), NOTE_ID), true);

    await relockNotes(session);
    assert.deepEqual(await setNodeLocked(session, OPEN_NOTE_ID, true), { status: "needsUnlock" });
  });
});

test("a note that is gone is refused rather than written", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    const action = await setNodeLocked(session, "note-missing", true);
    assert.equal(action.status, "refused");
  });
});

test("lock, background, foreground: the body leaves the webview and the session closes", async () => {
  const { bridge, storedMarkdown } = createLockingBridge();
  await withSession(bridge, async (session) => {
    const sent: HostToEditorMessage[] = [];
    const host = createEditorHostSession({
      session,
      send: (message) => sent.push(message),
      openLink: () => undefined,
      theme: () => "midnight",
      showFailure: () => undefined,
    });
    host.receive({ v: EDITOR_PROTOCOL_VERSION, type: "ready" });

    const loaded = sent.find((message) => message.type === "load");
    assert.ok(loaded && loaded.type === "load");
    assert.equal(loaded.markdown, BODY);

    await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);
    assert.equal(storedMarkdown(NOTE_ID), BODY);

    const phase = phaseSource("active");
    let concealed = false;
    const stop = createLockLifecycle({
      session,
      phase,
      setConcealed: (next) => {
        concealed = next;
      },
    }).start();
    await Promise.resolve();

    // The app switcher is coming up: the cover is raised in the same turn, and
    // the key is still held because a system prompt looks identical from here.
    phase.set("inactive");
    assert.equal(concealed, true);
    assert.equal(session.store.getState().noteLock.unlocked, true);

    phase.set("background");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(session.store.getState().noteLock.unlocked, false);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), "");
    assert.equal(isNoteSealed(session.store.getState(), NOTE_ID), true);

    const cleared = sent.filter((message) => message.type === "remote-change").at(-1);
    assert.ok(cleared && cleared.type === "remote-change");
    assert.deepEqual(
      cleared.changeSet.documents.map((document) => [document.noteId, document.markdown]),
      [[NOTE_ID, ""]],
    );

    // Foreground. Nothing reopens on its own: the body is back only after the
    // secret is.
    phase.set("active");
    assert.equal(concealed, false);
    assert.equal(session.store.getState().noteLock.unlocked, false);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), "");

    await unlockNotes(session, SECRET);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), BODY);
    assert.deepEqual(sealedNoteIds(session.store.getState()), []);

    const reopened = sent.filter((message) => message.type === "remote-change").at(-1);
    assert.ok(reopened && reopened.type === "remote-change");
    assert.equal(reopened.changeSet.documents[0]?.markdown, BODY);

    stop();
    host.dispose();
  });
});

test("wrong secrets are free three times, then wait 30s, 2m, 10m and 30m", async () => {
  const { bridge, clock } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);
    await relockNotes(session);

    const waits: (number | null)[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await assert.rejects(unlockNotes(session, "0000"));
      const lock = await bridge.noteLockState();
      session.store.setNoteLock(lock);
      assert.equal(lock.failedAttempts, attempt);
      const wait = lock.nextAttemptAt === null ? null : lock.nextAttemptAt - clock.now;
      waits.push(wait);
      // Sitting the delay out is the only way to the next attempt; that is
      // what makes it a backoff rather than a counter.
      clock.now += wait ?? 0;
    }

    assert.deepEqual(waits, [null, null, 30_000, 120_000, 600_000, 1_800_000]);
  });
});

test("the delay the backend set is enforced, and a correct secret clears the count", async () => {
  const { bridge, clock } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);
    await relockNotes(session);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(unlockNotes(session, "0000"));
    }
    session.store.setNoteLock(await bridge.noteLockState());
    assert.equal(unlockPresentation(session.store.getState().noteLock, clock.now).throttled, true);

    // Even the right secret is refused while the delay is running, so a
    // biometric prompt cannot walk past a backoff a typed attempt earned.
    await assert.rejects(unlockNotes(session, SECRET), /Too many attempts/);

    clock.now += 30_000;
    session.store.setNoteLock(await bridge.noteLockState());
    assert.equal(unlockPresentation(session.store.getState().noteLock, clock.now).throttled, false);

    await unlockNotes(session, SECRET);
    assert.equal(session.store.getState().noteLock.failedAttempts, 0);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), BODY);
  });
});

test("the idle timer drops the key without the application going anywhere", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);

    let fire: (() => void) | null = null;
    const lifecycle = createLockLifecycle({
      session,
      phase: phaseSource("active"),
      setConcealed: () => undefined,
      timers: {
        setTimeout: ((run: () => void) => {
          fire = run;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout,
        clearTimeout: (() => undefined) as typeof clearTimeout,
      },
    });
    const stop = lifecycle.start();
    await Promise.resolve();

    assert.ok(fire, "an idle timer is armed while the session is open");
    (fire as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(session.store.getState().noteLock.unlocked, false);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), "");
    stop();
  });
});

test("opened bodies are fetched again whenever a placeholder appears with the key held", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);
    await relockNotes(session);
    await unlockNotes(session, SECRET);

    const stop = createLockLifecycle({
      session,
      phase: phaseSource("active"),
      setConcealed: () => undefined,
    }).start();
    await Promise.resolve();

    // A sync delta puts the stored placeholder back underneath an open session.
    session.store.applyRemoteDocuments(await bridge.readWorkspaceDelta([NOTE_ID]));
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), "");

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), BODY);
    stop();
  });
});

test("unknown application states cover the screen rather than exposing it", () => {
  assert.equal(appPhase("active"), "active");
  assert.equal(appPhase("background"), "background");
  assert.equal(appPhase("inactive"), "inactive");
  assert.equal(appPhase("unknown"), "inactive");
});

test("biometric unlock stores the secret behind an authenticated keystore entry", async () => {
  const secureStore = fakeSecureStore();
  const biometrics = createBiometricUnlock({
    biometrics: fakeBiometrics(),
    keystore: createBiometricKeystore(secureStore),
  });

  assert.deepEqual(await biometrics.describe(), { state: "off", kind: "fingerprint" });
  assert.deepEqual(await biometrics.enable(SECRET), { state: "on", kind: "fingerprint" });

  // The marker is readable without a prompt; the secret is not, and nothing
  // derived from the content key is stored at all.
  assert.deepEqual([...secureStore.entries.keys()].sort(), [
    "skriuw.note-lock-biometrics",
    "skriuw.note-lock-secret",
  ]);
  assert.equal(secureStore.entries.get("skriuw.note-lock-secret"), SECRET);
  assert.equal(secureStore.prompts.length, 0);

  const reveal = await biometrics.reveal("Unlock your locked notes");
  assert.deepEqual(reveal, { outcome: "secret", secret: SECRET });
  assert.deepEqual(secureStore.prompts, ["Unlock your locked notes"]);

  assert.deepEqual(await biometrics.disable(), { state: "off", kind: "fingerprint" });
  assert.equal(secureStore.entries.size, 0);
});

test("turning biometrics off in the device settings falls back to the PIN", async () => {
  const secureStore = fakeSecureStore();
  let enrolled = true;
  const biometrics = createBiometricUnlock({
    biometrics: fakeBiometrics({
      availability: async () =>
        enrolled
          ? { available: true, kind: "face" }
          : { available: false, reason: "notEnrolled" },
    }),
    keystore: createBiometricKeystore(secureStore),
  });

  await biometrics.enable(SECRET);
  enrolled = false;

  assert.deepEqual(await biometrics.describe(), { state: "notEnrolled" });
  assert.equal(secureStore.entries.size, 0, "the entry the platform invalidated is dropped");

  enrolled = true;
  assert.deepEqual(await biometrics.describe(), { state: "off", kind: "face" });
});

test("a keystore that reports an invalidated key falls back rather than failing", async () => {
  const secureStore = fakeSecureStore();
  const biometrics = createBiometricUnlock({
    biometrics: fakeBiometrics(),
    keystore: createBiometricKeystore(secureStore),
  });
  await biometrics.enable(SECRET);

  secureStore.fail(new Error("Key permanently invalidated"));
  assert.deepEqual(await biometrics.reveal("Unlock"), { outcome: "unavailable" });
  assert.equal(secureStore.entries.size, 0);
});

test("a dismissed prompt is not a failure, and an unknown one is not a dismissal", () => {
  assert.deepEqual(classifyRevealError(new Error("User canceled the operation")), {
    outcome: "cancelled",
  });
  assert.deepEqual(classifyRevealError(new Error("Biometry is not available")), {
    outcome: "unavailable",
  });
  assert.deepEqual(classifyRevealError(new Error("keystore busy")), {
    outcome: "failed",
    message: "keystore busy",
  });
});

test("a build without the keystore refuses to arm biometrics instead of storing the secret", async () => {
  const biometrics = createBiometricUnlock({
    biometrics: fakeBiometrics(),
    keystore: createUnavailableBiometricKeystore(),
  });
  await assert.rejects(biometrics.enable(SECRET), /cannot reach the device keystore/);
  assert.deepEqual(await biometrics.describe(), { state: "off", kind: "fingerprint" });

  const withoutSensor = createBiometricUnlock({
    biometrics: createUnavailableBiometrics(),
    keystore: createUnavailableBiometricKeystore(),
  });
  assert.deepEqual(await withoutSensor.describe(), { state: "unsupported" });
});

/** Standing in for the real one, so the re-wrap can be observed exactly. */
function recordingBiometrics(initial: string | null): BiometricUnlock & { held: () => string | null } {
  let held = initial;
  return {
    held: () => held,
    describe: async () =>
      held === null ? { state: "off", kind: "fingerprint" } : { state: "on", kind: "fingerprint" },
    enable: async (secret) => {
      held = secret;
      return { state: "on", kind: "fingerprint" };
    },
    disable: async () => {
      held = null;
      return { state: "off", kind: "fingerprint" };
    },
    reveal: async () =>
      held === null ? { outcome: "unavailable" } : { outcome: "secret", secret: held },
  };
}

test("changing the secret re-wraps the keystore entry", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    await setUpNoteLock(session, PIN);
    const biometrics = recordingBiometrics(SECRET);

    await changeNoteSecret(
      session,
      { kind: "passphrase", secret: "correct horse", hint: null },
      biometrics,
    );
    assert.equal(biometrics.held(), "correct horse");

    await relockNotes(session);
    const reveal = await biometrics.reveal("Unlock");
    assert.equal(reveal.outcome === "secret" && reveal.secret, "correct horse");
    await unlockNotes(session, "correct horse");
    assert.equal(session.store.getState().noteLock.unlocked, true);
  });
});

test("recovery re-wraps the entry and removing the lock clears it", async () => {
  const { bridge } = createLockingBridge();
  await withSession(bridge, async (session) => {
    const code = await setUpNoteLock(session, PIN);
    await setNodeLocked(session, NOTE_ID, true);
    const biometrics = recordingBiometrics(SECRET);
    await relockNotes(session);

    await recoverNotes(session, code, { kind: "pin", secret: "9090", hint: null }, biometrics);
    assert.equal(biometrics.held(), "9090");
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), BODY);

    await removeLock(session, biometrics);
    assert.equal(biometrics.held(), null);
    assert.equal(session.store.getState().noteLock.configured, false);
    assert.equal(isNodeLocked(session.store.getState(), NOTE_ID), false);
    assert.equal(markdownOf(session.store.getState(), NOTE_ID), BODY);
  });
});

test("a re-wrap that cannot be written turns biometrics off rather than leaving a stale secret", async () => {
  const reported: unknown[] = [];
  const broken: BiometricUnlock = {
    ...recordingBiometrics(SECRET),
    enable: async () => {
      throw new Error("keystore is full");
    },
  };
  let disabled = false;
  await rearmBiometrics(
    {
      describe: broken.describe,
      enable: broken.enable,
      disable: async () => {
        disabled = true;
        return { state: "off", kind: "fingerprint" };
      },
    },
    "9090",
    (error) => reported.push(error),
  );
  assert.equal(disabled, true);
  assert.equal(reported.length, 1);
});
