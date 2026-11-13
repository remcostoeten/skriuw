type Props = {
  label: string;
  count?: number;
};

export function SectionLabel({ label, count }: Props) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-1.5 pr-1.5 pl-3.5 text-[11px] font-medium text-theme-dim select-none">
      <span>{label}</span>
      {count !== undefined && <span className="text-[10.5px] tabular-nums">{count}</span>}
    </div>
  );
}
