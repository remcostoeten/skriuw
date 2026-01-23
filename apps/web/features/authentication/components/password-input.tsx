import { cn } from "@skriuw/shared";
import { Eye, EyeOff } from "lucide-react";
import { useState, InputHTMLAttributes } from "react";

type PasswordInputProps = {
	showToggle?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function PasswordInput({
	className,
	showToggle = true,
	id = 'password-input',
	...props
}: PasswordInputProps) {
	const [showPassword, setShowPassword] = useState(false)

	return (
		<div className='relative w-full'>
			<input
				type={showPassword ? 'text' : 'password'}
				id={id}
				name={props.autoComplete === 'new-password' ? 'confirm-password' : 'password'}
				autoComplete={props.autoComplete || 'current-password'}
				aria-describedby={showToggle ? `${id}-toggle-hint` : undefined}
				className={cn(
					'flex h-12 w-full rounded-md border border-border bg-background px-4 py-2 text-base md:text-sm',
					'ring-offset-background placeholder:text-muted-foreground',
					'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
					'disabled:cursor-not-allowed disabled:opacity-50',
					'text-foreground',
					showToggle && 'pr-12',
					className
				)}
				{...props}
			/>

			{showToggle && (
				<>
					<button
						type='button'
						onClick={() => setShowPassword(!showPassword)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
						aria-pressed={showPassword}
						className={cn(
							'absolute right-3 top-1/2 -translate-y-1/2',
							'p-1 rounded-md text-muted-foreground',
							'hover:text-foreground hover:bg-secondary/50',
							'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
							'transition-colors'
						)}
					>
						{showPassword ? (
							<EyeOff className='h-4 w-4' aria-hidden='true' />
						) : (
							<Eye className='h-4 w-4' aria-hidden='true' />
						)}
					</button>
					<span id={`${id}-toggle-hint`} className='sr-only'>
						Press the button to {showPassword ? 'hide' : 'show'} password
					</span>
				</>
			)}
		</div>
	)
}
