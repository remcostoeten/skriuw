import { cn } from 'utils';

type props = {
	children: React.ReactNode;
	isInputVisible?: boolean;
	hasBorder?: boolean;
	className?: string;
}

export function TopSectionWrapper({
	children,
	isInputVisible = false,
	className,
	hasBorder = false,
}: props) {
	return (
		<div
			className={cn(
				"flex flex-row items-center justify-center w-full h-10 px-3.5 gap-2 shrink-0",
				"transform transition-all",
				isInputVisible ? "-translate-y-12" : "translate-y-0",
				className,
				hasBorder ? "border-b" : ""
			)}
		>
			{children}
		</div>
	);
}