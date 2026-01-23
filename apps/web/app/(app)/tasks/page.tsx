'use client'

import { CheckSquare } from "lucide-react";

export default function TasksPage() {
	return (
		<div className='flex-1 flex flex-col items-center justify-center min-h-[60vh]'>
			<div className='flex flex-col items-center gap-6 text-center max-w-md px-6'>
				<div className='w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center'>
					<CheckSquare className='w-8 h-8 text-emerald-500' />
				</div>
				<div className='space-y-2'>
					<h1 className='text-2xl font-bold text-foreground'>Tasks</h1>
					<p className='text-sm text-muted-foreground'>
						View all your tasks from across your notes. Click a task to jump to its
						source note.
					</p>
				</div>
				<div className='mt-4 text-xs text-muted-foreground/70'>
					<p>
						Create tasks in notes using{' '}
						<code className='px-1.5 py-0.5 rounded bg-muted font-mono'>/task</code> in
						the editor
					</p>
				</div>
			</div>
		</div>
	)
}
