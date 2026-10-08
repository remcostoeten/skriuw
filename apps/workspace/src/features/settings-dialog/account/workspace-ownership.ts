import { settingsCopy } from "@/shared/ui/settings-copy";
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
      ? settingsCopy.account.sharedByEveryAccountThatSigns
      : settingsCopy.account.linkedToThisAccountAnotherAccount;
  }
  return slot === null
    ? settingsCopy.account.notLinkedToAnAccountYet
    : settingsCopy.account.linkedToACloudAccountSign;
}

/** Short form of a workspace id for the settings row: `w_a1b2c3d4…`. */
export function shortWorkspaceId(slot: string): string {
  return `${slot.slice(0, 10)}…`;
}
