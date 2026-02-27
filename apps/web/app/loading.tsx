import { Skeleton } from '@skriuw/ui/skeleton'

export default function RootLoading() {
	return (
		<div className='flex-1 flex flex-col p-8'>
			<Skeleton className='h-8 w-48 mb-6' />
			<div className='space-y-3'>
				<Skeleton className='h-4 w-full' />
				<Skeleton className='h-4 w-5/6' />
				<Skeleton className='h-4 w-4/6' />
				<Skeleton className='h-4 w-full' />
				<Skeleton className='h-4 w-3/4' />
			</div>
		</div>
	)
}
