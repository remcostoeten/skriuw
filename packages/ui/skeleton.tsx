import { cn } from '@skriuw/core-logic'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
	return <div className={cn('animate-pulse rounded-md bg-muted/50', className)} {...props} />
}
