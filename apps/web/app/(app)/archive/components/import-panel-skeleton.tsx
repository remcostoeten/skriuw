import { Skeleton } from "@skriuw/ui/skeleton";

export function ImportPanelSkeleton() {
	return (
		<div className='space-y-6'>
			{/* Drag & Drop Area */}
			<div className='relative rounded-lg border-2 border-dashed border-border p-8 text-center'>
				<Skeleton className='h-10 w-10 mx-auto mb-4' />
				<Skeleton className='h-4 w-32 mx-auto mb-1' />
				<Skeleton className='h-3 w-24 mx-auto' />
			</div>

			{/* Supported Formats */}
			<div className='space-y-3'>
				<Skeleton className='h-4 w-32' />
				<div className='space-y-2'>
					{/* Format 1 */}
					<div className='flex items-center gap-3 p-3 border border-border rounded-lg'>
						<Skeleton className='h-4 w-4' />
						<div className='flex-1 space-y-1'>
							<Skeleton className='h-4 w-24' />
							<Skeleton className='h-3 w-40' />
						</div>
					</div>

					{/* Format 2 */}
					<div className='flex items-center gap-3 p-3 border border-border rounded-lg'>
						<Skeleton className='h-4 w-4' />
						<div className='flex-1 space-y-1'>
							<Skeleton className='h-4 w-28' />
							<Skeleton className='h-3 w-36' />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export function ImportPreviewSkeleton() {
	return (
		<div className='space-y-6'>
			{/* Preview Card */}
			<div className='rounded-lg border border-border p-4 space-y-4'>
				<div className='flex items-center justify-between'>
					<Skeleton className='h-5 w-24' />
					<Skeleton className='h-8 w-8' />
				</div>

				{/* Stats */}
				<div className='flex gap-4'>
					<div className='flex-1 space-y-2'>
						<Skeleton className='h-4 w-12' />
						<Skeleton className='h-8 w-16' />
					</div>
					<div className='flex-1 space-y-2'>
						<Skeleton className='h-4 w-16' />
						<Skeleton className='h-8 w-16' />
					</div>
				</div>
			</div>

			{/* Action Buttons */}
			<div className='flex gap-3'>
				<Skeleton className='h-10 flex-1' />
				<Skeleton className='h-10 flex-1' />
			</div>
		</div>
	)
}

export function ImportingSkeleton() {
	return (
		<div className='text-center py-8'>
			<div className='relative'>
				<Skeleton className='h-10 w-10 mx-auto mb-4 rounded-full' />
				<div className='absolute inset-0 flex items-center justify-center'>
					<div className='h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin' />
				</div>
			</div>
			<Skeleton className='h-4 w-32 mx-auto mb-1' />
			<Skeleton className='h-3 w-24 mx-auto' />
		</div>
	)
}

export function ImportCompleteSkeleton() {
	return (
		<div className='text-center py-8'>
			<div className='relative'>
				<Skeleton className='h-16 w-16 mx-auto mb-4 rounded-full' />
			</div>
			<Skeleton className='h-6 w-40 mx-auto mb-1' />
			<Skeleton className='h-4 w-48 mx-auto mb-6' />
			<Skeleton className='h-10 w-32 mx-auto' />
		</div>
	)
}
