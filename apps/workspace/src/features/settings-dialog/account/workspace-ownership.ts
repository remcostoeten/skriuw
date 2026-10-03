/**
 * Explains which cloud account the local workspace on this device belongs to.
 *
 * An installation keeps one local workspace per account (ADR-0046), so the
 * notes on screen after signing out are still that account's and another
 * account signing in opens a workspace of its own. The registry knows the
 * account only by its workspace id, so the text names the relationship rather
 * than the person.
 */
export function workspaceOwnershipText(slot: string | null, signedIn: boolean): string {
  if (signedIn) {
    return slot === null
      ? "Shared by every account that signs in on this device."
      : "Linked to this account. Another account that signs in here opens a workspace of its own, and these notes stay here for you.";
  }
  return slot === null
    ? "Not linked to an account yet. The first account to sign in keeps these notes."
    : "Linked to a cloud account. Sign back into it to keep working on these notes; a different account opens a workspace of its own.";
}

/** Short form of a workspace id for the settings row: `w_a1b2c3d4…`. */
export function shortWorkspaceId(slot: string): string {
  return `${slot.slice(0, 10)}…`;
}
