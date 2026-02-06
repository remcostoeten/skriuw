'use client'

import { notify } from '@/lib/notify'
import { Button } from '@skriuw/ui'
import { Card } from '@skriuw/ui'
import { useState } from 'react'

export default function NotifyDemoPage() {
	const [log, setLog] = useState<string[]>([])

	const addLog = (message: string) => {
		setLog((prev) => [message, ...prev].slice(0, 10))
	}

	return (
		<div className='space-y-8'>
			<div>
				<h1 className='text-3xl font-bold mb-2'>Notification System Demo</h1>
				<p className='text-muted-foreground'>
					Demonstration of the lightweight notification system
				</p>
			</div>

			<div className='grid md:grid-cols-2 gap-6'>
				<Card className='p-6 space-y-4'>
					<h2 className='text-xl font-semibold'>Basic Usage</h2>
					<div className='space-y-3'>
						<Button
							onClick={() => {
								notify('Hello, World!')
								addLog('Simple notification shown')
							}}
						>
							Simple Notification
						</Button>
						<Button
							variant='outline'
							onClick={() => {
								notify('This notification will disappear quickly').duration(2000)
								addLog('2-second notification shown')
							}}
						>
							2 Second Duration
						</Button>
						<Button
							variant='outline'
							onClick={() => {
								notify('This notification will stay for a while').duration(5000)
								addLog('5-second notification shown')
							}}
						>
							5 Second Duration
						</Button>
					</div>
				</Card>

				<Card className='p-6 space-y-4'>
					<h2 className='text-xl font-semibold'>With Revert Action</h2>
					<div className='space-y-3'>
						<Button
							onClick={() => {
								notify('Item deleted').allowRevert('Undo', () => {
									addLog('Undo action triggered!')
									notify('Item restored').duration(2000)
								})
								addLog('Deletion notification shown')
							}}
						>
							Delete (with Undo)
						</Button>
						<Button
							variant='outline'
							onClick={() => {
								let count = 0
								notify('Action completed').allowRevert('Redo', () => {
									count++
									addLog(`Action repeated (count: ${count})`)
									notify(`Redo ${count}`).duration(1500)
								})
								addLog('Action notification shown')
							}}
						>
							Action (with Redo)
						</Button>
					</div>
				</Card>

				<Card className='p-6 space-y-4'>
					<h2 className='text-xl font-semibold'>Quick Success/Error</h2>
					<div className='space-y-3'>
						<Button
							className='bg-green-600 hover:bg-green-700'
							onClick={() => {
								notify('✓ Changes saved successfully').duration(3000)
								addLog('Success notification shown')
							}}
						>
							Save Success
						</Button>
						<Button
							variant='destructive'
							onClick={() => {
								notify('✕ Failed to complete operation').duration(3000)
								addLog('Error notification shown')
							}}
						>
							Simulate Error
						</Button>
					</div>
				</Card>

				<Card className='p-6 space-y-4'>
					<h2 className='text-xl font-semibold'>Action Log</h2>
					<div className='bg-muted rounded-md p-4 min-h-[200px] max-h-[300px] overflow-y-auto'>
						{log.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								Actions will appear here
							</p>
						) : (
							<div className='space-y-2'>
								{log.map((entry, index) => (
									<div
										key={index}
										className='text-sm font-mono text-muted-foreground'
									>
										<span className='text-xs text-muted-foreground/50'>
											[{index + 1}]
										</span>{' '}
										{entry}
									</div>
								))}
							</div>
						)}
					</div>
					<Button
						variant='ghost'
						size='sm'
						onClick={() => setLog([])}
						disabled={log.length === 0}
					>
						Clear Log
					</Button>
				</Card>
			</div>

			<Card className='p-6'>
				<h2 className='text-xl font-semibold mb-4'>API Reference</h2>
				<div className='space-y-4'>
					<div>
						<h3 className='font-semibold mb-2'>Basic Usage</h3>
						<pre className='bg-muted p-4 rounded text-sm overflow-x-auto'>
							{`notify('Your message here')`}
						</pre>
					</div>
					<div>
						<h3 className='font-semibold mb-2'>Chainable Methods</h3>
						<pre className='bg-muted p-4 rounded text-sm overflow-x-auto'>
							{`notify('Message')
    .duration(5000)        // Set duration in milliseconds
    .allowRevert('Undo', () => {  // Add revert button
        // Handle revert action
    })`}
						</pre>
					</div>
				</div>
			</Card>
		</div>
	)
}
