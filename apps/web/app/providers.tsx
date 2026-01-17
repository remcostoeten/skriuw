'use client'

import { AlertCircle } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'

import { Analytics } from '@vercel/analytics/react'

import { EmptyState } from '@skriuw/ui'

import { TooltipProvider } from '@skriuw/ui'

import { ensureStorageInitialized } from './storage'
import { getQueryClient } from '@/lib/query-client'

import { EditorTabsProvider } from '../features/editor/tabs'
import { NotesProvider } from '@/features/notes/context/notes-context'
import { SettingsProvider } from '../features/settings'
import { ContextMenuProvider } from '../features/shortcuts/context-menu-context'
import { ShortcutProvider } from '../features/shortcuts/global-shortcut-provider'

import { AppLayoutManager } from '../components/layout/app-layout-manager'
import { CommandExecutor } from '../components/command-executor'

type props = {
	children: ReactNode
}

function StorageInitializer({ children }: props) {
	try {
		ensureStorageInitialized()
	} catch (error) {
		console.error('Failed to initialize storage:', error)
		return (
			<div className="flex-1 flex items-center justify-center min-h-screen bg-background">
				<EmptyState
					message="Storage initialization failed"
					submessage={
						error instanceof Error ? error.message : String(error)
					}
					icon={<AlertCircle className="h-8 w-8 text-destructive" />}
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
					<SettingsProvider>
						<NotesProvider>
							<ShortcutProvider>
								<ContextMenuProvider>
									<EditorTabsProvider>
										<AppLayoutManager>
											{children}
										</AppLayoutManager>
									</EditorTabsProvider>
								</ContextMenuProvider>
								<CommandExecutor />
							</ShortcutProvider>
						</NotesProvider>
					</SettingsProvider>
				</StorageInitializer>
				<Analytics />
			</TooltipProvider>
		</QueryClientProvider>
	)
}
