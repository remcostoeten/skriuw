import { WifiOff } from "lucide-react";

export default function OfflinePage() {
	return (
		<div className='flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-foreground'>
			<div className='flex h-20 w-20 items-center justify-center rounded-full bg-muted'>
				<WifiOff className='h-10 w-10 text-muted-foreground' />
			</div>
			<div className='text-center space-y-2'>
				<h1 className='text-3xl font-bold tracking-tight'>You are offline</h1>
				<p className='text-muted-foreground max-w-[400px]'>
					It simple couldn't connect to the internet. Please check your connection and try
					again.
				</p>
			</div>
			<button
				onClick={() => window.location.reload()}
				className='mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors'
			>
				Try Again
			</button>
		</div>
	)
}
