"use client";

import styles from "@/modules/changelog/components/changelog.module.css";

type Props = {
  reset: () => void;
};

export default function ChangelogError({ reset }: Props) {
  return (
    <div className={styles.card} role="alert">
      <p>Could not load releases.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
