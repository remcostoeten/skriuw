import { cn } from "@/shared/lib/utils";

type Props = {
	className?: string;
};

export function AvatarSkeleton({ className }: Props) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"relative h-9 w-9 overflow-hidden rounded-full border border-sidebar-border bg-sidebar",
				className,
			)}
		>
			<div className="absolute inset-1 animate-pulse rounded-full bg-sidebar-accent/70" />
		</div>
	);
}
