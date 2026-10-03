function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Name to show for the signed-in account, falling back to the email local part. */
export function accountDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : emailLocalPart(email);
}

/**
 * Up to two letters for the avatar. Multi-word names give one letter per word;
 * anything else falls back to the leading characters of the single word.
 */
export function accountInitials(name: string | null | undefined, email: string): string {
  const source = accountDisplayName(name, email);
  const words = source
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toLocaleUpperCase();
  }
  return `${words[0]![0]!}${words[1]![0]!}`.toLocaleUpperCase();
}
