'use client'

import { AlertCircle } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

import { EmptyState } from '@skriuw/ui/empty-state'

import { TooltipProvider } from '@skriuw/ui'

import { initializeAppStorage } from './storage'

import { EditorTabsProvider } from '../features/editor/tabs'
import { NotesProvider } from '../features/notes/context/notes-context'
import { SettingsProvider } from '../features/settings'
import { ContextMenuProvider } from '../features/shortcuts/context-menu-context'
import { ShortcutProvider } from '../features/shortcuts/global-shortcut-provider'

import { AppLayoutLoadingSkeleton } from '../components/layout/app-layout-loading'
import { AppLayoutManager } from '../components/layout/app-layout-manager'

type props = {
	children: ReactNode
}

function StorageInitializer({ children }: props) {
	const [isInitialized, setIsInitialized] = useState(false)
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		let isMounted = true
		const timeoutId = setTimeout(() => {
			if (isMounted && !isInitialized) {
				console.warn('Storage initialization taking too long, showing app anyway')
				setIsInitialized(true)
			}
		}, 5000) // 5 second timeout

		initializeAppStorage()
			.then(() => {
				if (isMounted) {
					console.log('✅ Storage initialized successfully')
					clearTimeout(timeoutId)
					setIsInitialized(true)
					setError(null)
				}
			})
			.catch((err) => {
				if (isMounted) {
					console.error('Failed to initialize storage:', err)
					clearTimeout(timeoutId)
					setError(err instanceof Error ? err : new Error(String(err)))
					// Still show app even if storage fails
					setIsInitialized(true)
				}
			})

		return () => {
			isMounted = false
			clearTimeout(timeoutId)
		}
	}, [isInitialized])

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center min-h-screen bg-background">
				<EmptyState
					message="Storage initialization failed"
					submessage={error.message}
					icon={<AlertCircle className="h-8 w-8 text-destructive" />}
					actions={[
						{
							label: 'Refresh page',
							onClick: () => window.location.reload(),
						},
					]}
				/>
			</div>
		)
	}

	return <>{isInitialized ? children : <AppLayoutLoadingSkeleton />}</>
}

export function Providers({ children }: props) {
	return (
		<TooltipProvider delayDuration={0}>
			<SonnerToaster />
			<StorageInitializer>
				<SettingsProvider>
					<NotesProvider>
						<ShortcutProvider>
							<ContextMenuProvider>
								<EditorTabsProvider>
									<AppLayoutManager>{children}</AppLayoutManager>
								</EditorTabsProvider>
							</ContextMenuProvider>
						</ShortcutProvider>
					</NotesProvider>
				</SettingsProvider>
			</StorageInitializer>
		</TooltipProvider>
	)
}
