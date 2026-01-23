import { cn } from "@skriuw/shared";

type StatCardProps = {
	label: string
	value: number
	variant?: 'default' | 'success' | 'info'
}

export function StatCard({ label, value, variant = 'default' }: StatCardProps) {
	return (
		<div
			className={cn(
				'flex-1 rounded-lg border p-3 text-center',
				variant === 'success' && 'border-green-500/20 bg-green-500/5',
				variant === 'info' && 'border-blue-500/20 bg-blue-500/5',
				variant === 'default' && 'border-border bg-muted/30'
			)}
		>
			<div className='text-2xl font-semibold'>{value}</div>
			<div className='text-xs text-muted-foreground'>{label}</div>
		</div>
	)
}

type props = {
	title: string
	description: string
	icon: React.ReactNode
	fileType: string
	isSelected: boolean
	onClick: () => void
}

export function FormatOptionCard({
	title,
	description,
	icon,
	fileType,
	isSelected,
	onClick
}: props) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={cn(
				'flex items-start gap-4 rounded-lg border p-4 text-left transition-all w-full',
				'hover:border-primary/20 hover:bg-primary/5',
				isSelected ? 'border-primary/30 bg-primary/10' : 'border-border'
			)}
		>
			<div
				className={cn(
					'rounded-lg p-2',
					isSelected ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
				)}
			>
				{icon}
			</div>
			<div className='flex-1 min-w-0'>
				<div className='font-medium'>{title}</div>
				<div className='text-sm text-muted-foreground'>{description}</div>
			</div>
			<div className='text-xs text-muted-foreground shrink-0'>{fileType}</div>
		</button>
	)
}

type FormatInfoCardProps = {
	icon: React.ReactNode
	title: string
	description: string
}

export function FormatInfoCard({ icon, title, description }: FormatInfoCardProps) {
	return (
		<div className='flex items-center gap-3 rounded-lg border border-border p-3'>
			<div className='rounded-md bg-muted p-1.5 text-muted-foreground'>{icon}</div>
			<div className='min-w-0'>
				<div className='text-sm font-medium'>{title}</div>
				<div className='text-xs text-muted-foreground'>{description}</div>
			</div>
		</div>
	)
}
