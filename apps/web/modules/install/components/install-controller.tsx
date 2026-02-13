'use client'

import { useInstallPrompt } from '../hooks'
import { InstallBanner } from './install-banner'
import { InstallInstructions } from './install-instructions'
import { WifiOff } from 'lucide-react'

export function InstallController() {
	const {
		showBanner,
		showInstructions,
		platform,
		isOnline,
		triggerInstall,
		dismiss,
		closeInstructions
	} = useInstallPrompt()

	return (
		<>
			{!isOnline && (
				<div className='fixed bottom-4 left-4 right-4 z-[100] flex items-center justify-center animate-in slide-in-from-bottom-4 duration-300'>
					<div className='flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg'>
						<WifiOff className='h-4 w-4' />
						<span>You are offline</span>
					</div>
				</div>
			)}
			{showBanner && (
				<InstallBanner platform={platform} onInstall={triggerInstall} onDismiss={dismiss} />
			)}
			<InstallInstructions
				isOpen={showInstructions}
				onOpenChange={(open) => !open && closeInstructions()}
			/>
		</>
	)
}
