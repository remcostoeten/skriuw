import { Skeleton } from '@skriuw/ui/skeleton'

export default function TasksLoading() {
	return (
		<div className='flex-1 flex flex-col items-center justify-center min-h-[60vh]'>
			<div className='flex flex-col items-center gap-6 text-center max-w-md px-6'>
				<Skeleton className='w-16 h-16 rounded-2xl' />
				<div className='space-y-2 flex flex-col items-center'>
					<Skeleton className='h-7 w-24' />
					<Skeleton className='h-4 w-64' />
					<Skeleton className='h-4 w-48' />
				</div>
			</div>
		</div>
	)
}
