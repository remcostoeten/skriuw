type Props = {
	children: React.ReactNode;
	className?: string;
};

export function LayoutContainer({ children, className = "" }: Props) {
	return <div className={`relative flex h-dvh min-h-dvh flex-col ${className}`}>{children}</div>;
}
