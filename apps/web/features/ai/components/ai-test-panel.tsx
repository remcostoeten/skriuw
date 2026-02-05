'use client'

import { useState } from 'react'
import { useTestPrompt } from '../hooks'
import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { Textarea } from '@skriuw/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'

export function AITestPanel() {
	const [prompt, setPrompt] = useState('')
	const [response, setResponse] = useState<string | null>(null)
	const { mutate: testPromptMutation, isPending } = useTestPrompt()

	function handleTest() {
		if (!prompt.trim()) return

		testPromptMutation(prompt, {
			onSuccess: (data) => {
				setResponse(data.content)
			},
			onError: (error) => {
				setResponse(`Error: ${error.message}`)
			}
		})
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2 text-base'>
					<Sparkles className='h-4 w-4' />
					Test Your Configuration
				</CardTitle>
				<CardDescription>
					Send a test prompt to verify your AI setup is working correctly.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				<Textarea
					placeholder='Enter a test prompt...'
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					rows={3}
					disabled={isPending}
				/>
				<Button onClick={handleTest} disabled={isPending || !prompt.trim()} size='sm'>
					{isPending ? (
						<>
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							Testing...
						</>
					) : (
						'Test Prompt'
					)}
				</Button>
				{response && (
					<div className='rounded-md border bg-muted/50 p-3'>
						<p className='text-sm whitespace-pre-wrap'>{response}</p>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
