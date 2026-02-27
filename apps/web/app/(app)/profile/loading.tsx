import { Skeleton } from '@skriuw/ui/skeleton'

export default function ProfileLoading() {
	return (
		<div className='mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10'>
			<div className='space-y-2'>
				<Skeleton className='h-6 w-40 rounded-full' />
				<Skeleton className='h-8 w-48' />
				<Skeleton className='h-4 w-72' />
			</div>

			<div className='border border-border rounded-lg p-6 space-y-4'>
				<div className='flex items-center gap-4'>
					<Skeleton className='h-16 w-16 rounded-full' />
					<div className='space-y-2 flex-1'>
						<Skeleton className='h-5 w-40' />
						<Skeleton className='h-4 w-56' />
					</div>
				</div>
			</div>

			<Skeleton className='h-px w-full' />

			<div className='border border-border rounded-lg p-6 space-y-3'>
				<Skeleton className='h-5 w-32' />
				<Skeleton className='h-4 w-full' />
				<Skeleton className='h-4 w-3/4' />
			</div>
		</div>
	)
}
