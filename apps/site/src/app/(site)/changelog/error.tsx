"use client";

import { cn } from "@skriuw/shared/helpers/cn";
import { outlineButton } from "@/components/frame/control";
import styles from "@/modules/changelog/components/changelog.module.css";

type Props = {
  reset: () => void;
};

export default function ChangelogError({ reset }: Props) {
  return (
    <div
      className={cn(styles.card, styles.body, "flex flex-wrap items-center justify-between gap-3")}
      role="alert"
    >
      <p className={styles.muted}>Could not load releases from GitHub.</p>
      <button type="button" className={outlineButton} onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
