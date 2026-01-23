'use client'

import { QuickNoteInput } from "./components/quick-note-input";
import { ActivityCalendar } from "@/features/activity/components/activity-calendar";
import { RecentActivityList } from "@/features/activity/components/recent-activity-list";

export function QuickNoteDemo() {
	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='text-center space-y-2'>
				<h1 className='text-3xl font-bold'>Quick Note Demo</h1>
				<p className='text-muted-foreground'>
					Create notes and see your activity tracked in real-time
				</p>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Quick Note Input */}
				<div className='lg:col-span-1'>
					<QuickNoteInput />
				</div>

				{/* Activity Tracking */}
				<div className='lg:col-span-2 space-y-6'>
					<div className='space-y-4'>
						<div className='border rounded-lg p-6'>
							<h3 className='text-lg font-semibold mb-4'>Your Recent Activity</h3>
							<RecentActivityList groups={[]} />
						</div>
					</div>
				</div>
			</div>

			{/* Instructions */}
			<div className='border rounded-lg p-6 mt-8'>
				<h3 className='text-lg font-semibold mb-4'>How it works</h3>
				<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
					<div className='text-center space-y-2'>
						<div className='w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto'>
							<span className='text-blue-600 font-bold'>1</span>
						</div>
						<h3 className='font-semibold'>Create a Note</h3>
						<p className='text-sm text-gray-600'>
							Type a title and click "Create Note"
						</p>
					</div>
					<div className='text-center space-y-2'>
						<div className='w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto'>
							<span className='text-blue-600 font-bold'>2</span>
						</div>
						<h3 className='font-semibold'>Activity Tracked</h3>
						<p className='text-sm text-gray-600'>
							Your action is automatically recorded
						</p>
					</div>
					<div className='text-center space-y-2'>
						<div className='w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto'>
							<span className='text-blue-600 font-bold'>3</span>
						</div>
						<h3 className='font-semibold'>See the Data</h3>
						<p className='text-sm text-gray-600'>View activity in the list above</p>
					</div>
				</div>
			</div>
		</div>
	)
}
