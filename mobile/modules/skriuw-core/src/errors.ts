export type SkriuwCoreErrorKind =
  | "workspace"
  | "recovery"
  | "invalid-payload"
  | "rejected"
  | "unsupported-protocol"
  | "conflict"
  | "not-found"
  | "already-exists"
  | "busy"
  | "closed"
  | "invalid-slot"
  | "slot-in-use"
  | "internal";

export type SkriuwCoreFailure = {
  kind: SkriuwCoreErrorKind;
  message: string;
  id?: string;
  expected?: number;
  current?: number;
  version?: number;
};

const KINDS: ReadonlySet<string> = new Set<SkriuwCoreErrorKind>([
  "workspace",
  "recovery",
  "invalid-payload",
  "rejected",
  "unsupported-protocol",
  "conflict",
  "not-found",
  "already-exists",
  "busy",
  "closed",
  "invalid-slot",
  "slot-in-use",
  "internal",
]);

/**
 * Every failure of the native core. Branch on `kind`; `message` is bounded by
 * the core and is for the recovery surface and the log, never for control flow.
 */
export class SkriuwCoreError extends Error {
  readonly kind: SkriuwCoreErrorKind;
  readonly id: string | undefined;
  readonly expected: number | undefined;
  readonly current: number | undefined;
  readonly version: number | undefined;

  constructor(failure: SkriuwCoreFailure, options?: { cause?: unknown }) {
    super(failure.message, options);
    this.name = "SkriuwCoreError";
    this.kind = failure.kind;
    this.id = failure.id;
    this.expected = failure.expected;
    this.current = failure.current;
    this.version = failure.version;
  }

  /** The startup failure surface: the database exists but cannot be used. */
  get needsRecovery(): boolean {
    return this.kind === "recovery" || this.kind === "workspace";
  }

  /** The same call is expected to succeed shortly after. */
  get isTransient(): boolean {
    return this.kind === "busy";
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Reads the failure half of a native result. A kind this build does not know
 * is reported as `internal` with the original kind kept in the message, so a
 * newer native library never turns into an unhandled branch.
 */
export function toSkriuwCoreError(raw: unknown): SkriuwCoreError {
  if (typeof raw !== "object" || raw === null) {
    return new SkriuwCoreError({
      kind: "internal",
      message: "native core reported a failure without a description",
    });
  }

  const failure = raw as Record<string, unknown>;
  const message = typeof failure.message === "string" ? failure.message : "unknown failure";

  if (typeof failure.kind !== "string" || !KINDS.has(failure.kind)) {
    return new SkriuwCoreError({
      kind: "internal",
      message: `unrecognized failure kind ${String(failure.kind)}: ${message}`,
    });
  }

  return new SkriuwCoreError({
    kind: failure.kind as SkriuwCoreErrorKind,
    message,
    id: typeof failure.id === "string" ? failure.id : undefined,
    expected: optionalNumber(failure.expected),
    current: optionalNumber(failure.current),
    version: optionalNumber(failure.version),
  });
}
