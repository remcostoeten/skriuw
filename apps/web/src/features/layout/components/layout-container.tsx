type Props = {
	children: React.ReactNode;
	className?: string;
};

export function LayoutContainer({ children, className = "" }: Props) {
	// max-h-full clamps to the parent when it has a definite height (the /app
	// shell, where a guest banner may sit above); elsewhere it resolves to none
	// and h-dvh keeps standalone pages (/s) full-height.
	return (
		<div className={`relative flex h-dvh max-h-full min-h-0 flex-col ${className}`}>
			{children}
		</div>
	);
}
