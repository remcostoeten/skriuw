interface LayoutContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function LayoutContainer({ children, className = "" }: LayoutContainerProps) {
  return (
    <div className={`relative flex h-dvh min-h-dvh flex-col ${className}`}>
      {children}
    </div>
  );
}
