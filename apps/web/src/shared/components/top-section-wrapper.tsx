import { cn } from 'utils';

type props = {
	children: React.ReactNode;
	isInputVisible?: boolean;
	className?: string;
}

export function TopSectionWrapper({
	children,
	isInputVisible = false,
	className
}: props) {
	return (
		<div
			className={cn(
				"flex flex-row items-center justify-center w-full h-40px px-3.5 gap-2 shrink-0",
				"transform transition-all",
				isInputVisible ? "-translate-y-12" : "translate-y-0",
				className
			)}
		>
			{children}
		</div>
	);
}