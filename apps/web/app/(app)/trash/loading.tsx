import { Skeleton } from '@skriuw/ui/skeleton'

export default function TrashLoading() {
	return (
		<div className='flex flex-col h-full'>
			<div className='border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4'>
				<div className='flex items-center gap-2'>
					<Skeleton className='h-6 w-6' />
					<Skeleton className='h-7 w-16' />
				</div>
				<Skeleton className='h-4 w-80 mt-1' />
			</div>

			<div className='flex-1 overflow-y-auto p-6'>
				<div className='max-w-5xl mx-auto w-full'>
					<div className='border border-border/70 rounded-lg shadow-sm overflow-hidden'>
						<div className='p-6 space-y-2'>
							<Skeleton className='h-5 w-32' />
							<Skeleton className='h-4 w-72' />
						</div>
						<div className='px-6 pb-6 space-y-3'>
							{Array.from({ length: 4 }).map((_, i) => (
								<div key={i} className='flex items-center gap-3 py-2'>
									<Skeleton className='h-4 w-4 rounded' />
									<Skeleton className='h-4 flex-1' />
									<Skeleton className='h-4 w-20' />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
