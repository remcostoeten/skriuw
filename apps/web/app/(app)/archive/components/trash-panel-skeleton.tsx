import { Skeleton } from '@skriuw/ui/skeleton'

export function TrashPanelSkeleton() {
	return (
		<div className='space-y-4'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<Skeleton className='h-4 w-24' />
				<Skeleton className='h-8 w-24' />
			</div>

			{/* Trash Items */}
			<div className='space-y-2'>
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className='flex items-center gap-3 p-3 rounded-lg border border-border'
					>
						{/* Icon */}
						<Skeleton className='h-5 w-5' />

						{/* Info */}
						<div className='flex-1 min-w-0 space-y-1'>
							<Skeleton className='h-4 w-48' />
							<div className='flex items-center gap-2'>
								<Skeleton className='h-3 w-32' />
								<Skeleton className='h-3 w-2' />
								<Skeleton className='h-3 w-16' />
							</div>
						</div>

						{/* Actions */}
						<div className='flex items-center gap-2'>
							<Skeleton className='h-8 w-16' />
							<Skeleton className='h-8 w-8' />
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

export function EmptyTrashSkeleton() {
	return (
		<div className='text-center py-12 border border-dashed border-border rounded-lg'>
			<Skeleton className='h-12 w-12 mx-auto mb-4 rounded' />
			<Skeleton className='h-4 w-24 mx-auto mb-2' />
			<Skeleton className='h-3 w-48 mx-auto' />
		</div>
	)
}

export function TrashLoadingSkeleton() {
	return (
		<div className='flex items-center justify-center py-12'>
			<div className='relative'>
				<Skeleton className='h-6 w-6 rounded-full' />
				<div className='absolute inset-0 flex items-center justify-center'>
					<div className='h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin' />
				</div>
			</div>
		</div>
	)
}
