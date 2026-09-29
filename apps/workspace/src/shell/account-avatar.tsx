import { Facehash } from "facehash";
import { FACEHASH_COLORS } from "./account-menu-model";

const FACE_COLORS = [...FACEHASH_COLORS];

type Props = {
  seed: string;
  initials: string;
  facehash: boolean;
};

export function AccountAvatar({ seed, initials, facehash }: Props) {
  if (!facehash) {
    return initials;
  }
  return (
    <Facehash
      name={seed}
      size="100%"
      colors={FACE_COLORS}
      intensity3d="subtle"
      showInitial={false}
      className="rounded-[inherit] text-[#1c1b1f]"
      aria-hidden="true"
    />
  );
}
