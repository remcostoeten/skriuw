import { cn } from "@/shared/lib/utils";

type SettingsFocusShortcutHintProps = {
	className?: string;
};

export function SettingsFocusShortcutHint({ className }: SettingsFocusShortcutHintProps) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-4 top-4 z-10 hidden h-8 items-center gap-2 rounded-md border border-border bg-background/90 px-2 text-[12px] font-medium text-muted-foreground shadow-sm backdrop-blur md:inline-flex",
				className,
			)}
			aria-label="Press slash to focus main settings"
		>
			<span>Focus main</span>
			<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[11px] text-foreground">
				/
			</kbd>
		</div>
	);
}
