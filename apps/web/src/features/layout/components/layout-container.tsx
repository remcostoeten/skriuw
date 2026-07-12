type Props = {
	children: React.ReactNode;
	className?: string;
};

export function LayoutContainer({ children, className = "" }: Props) {
	// Every workspace surface lives inside the /app shell's definite h-dvh flex
	// track. Filling that track avoids a second viewport-height calculation while
	// a loading boundary is being replaced, which previously made the mobile
	// chrome jump vertically during hydration.
	return <div className={`relative flex h-full min-h-0 flex-col ${className}`}>{children}</div>;
}
