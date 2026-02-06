'use client'

import { cn } from '@skriuw/shared'
import { Button } from '@skriuw/ui/button'
import { Download, X } from 'lucide-react'

type Props = {
	platform: 'ios' | 'android' | 'desktop'
	onInstall: () => void
	onDismiss: () => void
}

export function InstallBanner({ platform, onInstall, onDismiss }: Props) {
	return (
		<div
			className={cn(
				'fixed z-[80]',
				'bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_12px)] left-3 right-3',
				'sm:left-auto sm:right-4 sm:bottom-20 sm:w-auto sm:max-w-[340px]',
				'animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out'
			)}
		>
			<div
				className={cn(
					'flex items-center gap-3',
					'bg-background/95 backdrop-blur-xl',
					'border border-border/60',
					'p-3 rounded-2xl',
					'shadow-[0_4px_24px_rgba(0,0,0,0.25),0_1px_4px_rgba(0,0,0,0.15)]'
				)}
			>
				{/* Icon with brand accent */}
				<div
					className={cn(
						'flex h-11 w-11 shrink-0 items-center justify-center',
						'rounded-xl',
						'bg-[hsl(var(--brand-500)/0.12)]',
						'ring-1 ring-[hsl(var(--brand-400)/0.25)]'
					)}
				>
					<Download className='h-5 w-5 text-[hsl(var(--brand-400))]' />
				</div>

				{/* Text content */}
				<div className='flex-1 min-w-0 pr-1'>
					<p className='text-[13px] font-semibold text-foreground leading-tight'>
						Install Skriuw
					</p>
					<p className='text-[11px] text-muted-foreground leading-tight mt-0.5 truncate'>
						Better experience as an app
					</p>
				</div>

				{/* Actions */}
				<div className='flex items-center gap-1 shrink-0'>
					<Button
						size='sm'
						onClick={onInstall}
						className={cn(
							'h-9 px-4 text-xs font-semibold',
							'bg-foreground text-background hover:bg-foreground/90',
							'rounded-xl',
							'transition-all duration-150',
							'active:scale-[0.98]'
						)}
					>
						{platform === 'ios' ? 'How to' : 'Install'}
					</Button>
					{/* Dismiss button - 44x44px touch target */}
					<button
						type='button'
						onClick={onDismiss}
						className={cn(
							'flex items-center justify-center',
							'h-11 w-11 -mr-1', // 44x44px touch target, negative margin to balance visual weight
							'rounded-xl',
							'text-muted-foreground hover:text-foreground',
							'hover:bg-accent/50',
							'transition-colors duration-150',
							'active:scale-95',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
						)}
						aria-label='Dismiss install prompt'
					>
						<X className='h-4 w-4' />
					</button>
				</div>
			</div>
		</div>
	)
}
