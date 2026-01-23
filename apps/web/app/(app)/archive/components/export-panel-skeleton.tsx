import { Skeleton } from "@skriuw/ui/skeleton";

export function ExportPanelSkeleton() {
	return (
		<div className='space-y-6'>
			{/* Stats Cards */}
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

			{/* Export Format Section */}
			<div className='space-y-3'>
				<Skeleton className='h-4 w-24' />
				<div className='space-y-3'>
					{/* Format Option 1 */}
					<div className='flex items-center gap-3 p-4 border border-border rounded-lg'>
						<Skeleton className='h-5 w-5' />
						<div className='flex-1 space-y-1'>
							<Skeleton className='h-4 w-32' />
							<Skeleton className='h-3 w-48' />
						</div>
						<Skeleton className='h-6 w-12' />
					</div>

					{/* Format Option 2 */}
					<div className='flex items-center gap-3 p-4 border border-border rounded-lg'>
						<Skeleton className='h-5 w-5' />
						<div className='flex-1 space-y-1'>
							<Skeleton className='h-4 w-28' />
							<Skeleton className='h-3 w-44' />
						</div>
						<Skeleton className='h-6 w-12' />
					</div>
				</div>
			</div>

			{/* Export Button */}
			<Skeleton className='h-11 w-full' />
		</div>
	)
}
