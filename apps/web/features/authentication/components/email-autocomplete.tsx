'use client'

import { cn } from "@skriuw/shared";
import { useCallback, useEffect, useRef, useState } from "react";

const DOMAINS = [
	'gmail.com',
	'outlook.com',
	'hotmail.com',
	'hotmail.nl',
	'live.com',
	'live.nl',
	'icloud.com',
	'proton.me',
	'protonmail.com'
]

type TProps = {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	className?: string
	id?: string
}

function getParts(value: string) {
	const i = value.indexOf('@')
	if (i === -1) return { local: value, domain: '' }
	return {
		local: value.slice(0, i),
		domain: value.slice(i + 1)
	}
}

export function EmailAutocomplete({
	value,
	onChange,
	placeholder = 'name@example.com',
	className,
	id = 'email-input'
}: TProps) {
	const [inline, setInline] = useState('')
	const inputRef = useRef<HTMLInputElement>(null)

	const computeInline = useCallback(() => {
		const { local, domain } = getParts(value)
		if (!local || !value.includes('@')) return ''

		const match = DOMAINS.find((d) => d.startsWith(domain.toLowerCase()))

		if (!match) return ''
		if (domain.length >= match.length) return ''

		return match.slice(domain.length)
	}, [value])

	useEffect(() => {
		setInline(computeInline())
	}, [computeInline])

	function acceptInline() {
		if (!inline) return
		onChange(value + inline)
		setInline('')
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (!inline) return

		if (e.key === 'Tab' || e.key === 'ArrowRight') {
			e.preventDefault()
			acceptInline()
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		onChange(e.target.value)
	}

	return (
		<div className='relative w-full'>
			{inline && (
				<div
					aria-hidden='true'
					className='absolute inset-0 pointer-events-none flex items-center'
				>
					<span className='px-4 text-sm'>
						<span className='invisible'>{value}</span>
						<span className='text-muted-foreground/50'>{inline}</span>
					</span>
				</div>
			)}

			<input
				ref={inputRef}
				id={id}
				name='email'
				type='email'
				autoComplete='email'
				value={value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder={placeholder}
				className={cn(
					'flex h-12 w-full rounded-md border border-border bg-background px-4 py-2 text-base md:text-sm',
					'placeholder:text-muted-foreground',
					'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
					'disabled:cursor-not-allowed disabled:opacity-50',
					'text-foreground',
					className
				)}
			/>
		</div>
	)
}

export default EmailAutocomplete
