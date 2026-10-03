import { Facehash } from "facehash";

const FACE_TONES = [
  "bg-muted text-foreground",
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-foreground/12 text-foreground",
  "bg-foreground/20 text-foreground",
];

type Props = {
  seed: string;
  initials: string;
  facehash: boolean;
};

/**
 * The account's face: a Facehash derived from the stable account id, so every
 * account gets its own face that survives renames and matches on every device.
 * Turning the preference off falls back to the initials.
 */
export function AccountAvatar({ seed, initials, facehash }: Props) {
  if (!facehash) {
    return initials;
  }
  return (
    <Facehash
      name={seed}
      size="100%"
      colorClasses={FACE_TONES}
      variant="solid"
      intensity3d="subtle"
      showInitial={false}
      className="rounded-[inherit]"
      aria-hidden="true"
    />
  );
}
