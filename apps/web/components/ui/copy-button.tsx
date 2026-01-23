'use client'

import { Button } from "@skriuw/ui";
import { Copy, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
	text: string
	label?: string
	className?: string
}

export function CopyButton({ text, label = 'Copy', className }: CopyButtonProps) {
	const [copied, setCopied] = useState(false)
	const timeoutRef = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
				timeoutRef.current = null
			}
		}
	}, [])

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)

			// Clear any existing timeout
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current)
			}

			// Set new timeout and store ID
			timeoutRef.current = window.setTimeout(() => {
				setCopied(false)
				timeoutRef.current = null
			}, 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	return (
		<Button variant='outline' size='sm' onClick={handleCopy} className={className}>
			{copied ? (
				<>
					<Check className='h-4 w-4 mr-1' />
					Copied!
				</>
			) : (
				<>
					<Copy className='h-4 w-4 mr-1' />
					{label}
				</>
			)}
		</Button>
	)
}
