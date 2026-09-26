import styles from "@/modules/changelog/components/changelog.module.css";

export default function Loading() {
  return (
    <div className={styles.list} role="status" aria-label="Loading releases">
      {[0, 1, 2].map(function render(item) {
        return (
          <div key={item} className={styles.card} aria-hidden="true">
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
            <div className={styles.skeleton} />
          </div>
        );
      })}
    </div>
  );
}
