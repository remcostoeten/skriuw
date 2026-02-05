import { cn } from '@skriuw/shared'
import { Loader2 } from 'lucide-react'
import { ReactNode } from 'react'

export function StatCard({
	label,
	value,
	loading
}: {
	label: string
	value: number | string
	loading: boolean
}) {
	return (
		<div className='bg-muted/30 border rounded-lg p-2 text-center'>
			<div className='text-[10px] text-muted-foreground uppercase tracking-wider font-semibold'>
				{label}
			</div>
			<div className='text-lg font-bold tabular-nums text-foreground'>
				{loading ? <Loader2 className='h-4 w-4 animate-spin mx-auto my-1' /> : value}
			</div>
		</div>
	)
}

export function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className='text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-0.5'>
			{children}
		</div>
	)
}

export function ActionButton({
	icon: Icon,
	label,
	onClick,
	loading,
	variant = 'default',
	fullWidth
}: {
	icon: any
	label: string
	onClick: () => void
	loading?: boolean
	variant?: 'default' | 'destructive'
	fullWidth?: boolean
}) {
	return (
		<button
			onClick={onClick}
			disabled={loading}
			className={cn(
				'flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
				variant === 'default'
					? 'bg-background hover:bg-muted hover:border-border/80'
					: 'bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive/10',
				fullWidth ? 'w-full justify-center' : 'w-full justify-start'
			)}
		>
			{loading ? (
				<Loader2 className='h-3.5 w-3.5 animate-spin' />
			) : (
				<Icon className='h-3.5 w-3.5' />
			)}
			{label}
		</button>
	)
}
