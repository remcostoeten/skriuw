import type { Feature, FeatureStatus } from "../types";

type Props = {
  features: Feature[];
};

const cards: { status: FeatureStatus; label: string; accent: string }[] = [
  { status: "exploring", label: "Exploring", accent: "text-amber-300" },
  { status: "planned", label: "Planned", accent: "text-violet-300" },
  { status: "in_progress", label: "In progress", accent: "text-blue-300" },
  { status: "blocked", label: "Blocked", accent: "text-rose-300" },
  { status: "completed", label: "Completed", accent: "text-emerald-300" },
];

export function PlanningOverview({ features }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const count = features.filter((f) => f.status === c.status).length;
        return (
          <div key={c.status} className="rounded-lg border border-border bg-sidebar/40 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {c.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${c.accent}`}>{count}</p>
          </div>
        );
      })}
    </div>
  );
}
