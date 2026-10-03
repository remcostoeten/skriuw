import { cardSurface } from "@/components/frame/control";

export default function Loading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading releases">
      {[0, 1, 2].map(function render(item) {
        return (
          <div key={item} className={cardSurface} aria-hidden="true">
            {[0, 1, 2].map(function line(index) {
              return (
                <div
                  key={index}
                  className="m-6 h-4 animate-skeleton rounded bg-[color-mix(in_srgb,var(--ink-900)_8%,transparent)] first:w-[30%] last:w-3/4 motion-reduce:animate-none"
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
