import { cn } from "@/shared/lib/utils";

type Props = {
	icon?: string;
	className?: string;
};

export function NoteIcon({ icon, className }: Props) {
	if (!icon) return null;

	return (
		<span
			className={cn("inline-flex shrink-0 items-center justify-center", className)}
			aria-hidden
		>
			{icon}
		</span>
	);
}
