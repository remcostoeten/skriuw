'use client'

import { CommandExecutor } from '../components/command-executor'
import { AuthModal } from '../components/auth/auth-modal'
import { AuthModalProvider } from '../components/auth/auth-modal-context'
import { AppLayoutManager } from '../components/layout/app-layout-manager'
import { EditorTabsProvider } from '../features/editor/tabs'
import { SettingsProvider } from '../features/settings'
import { ContextMenuProvider } from '../features/shortcuts/context-menu-context'
import { ShortcutProvider } from '../features/shortcuts/global-shortcut-provider'
import { ensureStorageInitialized } from './storage'
import { NotesProvider } from '@/features/notes/context/notes-context'
import { getQueryClient } from '@/lib/query-client'
import { EmptyState } from '@skriuw/ui'
import { TooltipProvider } from '@skriuw/ui'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Analytics } from '@vercel/analytics/react'
import { AlertCircle } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'

type props = {
	children: ReactNode
}

function StorageInitializer({ children }: props) {
	try {
		ensureStorageInitialized()
	} catch (error) {
		console.error('Failed to initialize storage:', error)
		return (
			<div className='flex-1 flex items-center justify-center min-h-screen bg-background'>
				<EmptyState
					message='Storage initialization failed'
					submessage={error instanceof Error ? error.message : String(error)}
					icon={<AlertCircle className='h-8 w-8 text-destructive' />}
					actions={[
						{
							label: 'Refresh page',
							onClick: () => window.location.reload()
						}
					]}
				/>
			</div>
		)
	}

	return <>{children}</>
}

export function Providers({ children }: props) {
	const queryClient = getQueryClient()

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider delayDuration={0}>
				<StorageInitializer>
					<AuthModalProvider>
						<SettingsProvider>
							<NotesProvider>
								<ShortcutProvider>
									<ContextMenuProvider>
										<EditorTabsProvider>
											<AppLayoutManager>{children}</AppLayoutManager>
										</EditorTabsProvider>
									</ContextMenuProvider>
									<CommandExecutor />
								</ShortcutProvider>
							</NotesProvider>
						</SettingsProvider>
						<AuthModal />
					</AuthModalProvider>
				</StorageInitializer>
				<Analytics />
			</TooltipProvider>
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	)
}
