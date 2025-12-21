'use client'

import { AlertCircle } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

import { EmptyState } from '@skriuw/ui'

import { TooltipProvider } from '@skriuw/ui'

import { ensureStorageInitialized } from './storage'

import { EditorTabsProvider } from '../features/editor/tabs'
import { NotesProvider } from '@/features/notes/context/notes-context'
import { SettingsProvider } from '../features/settings'
import { ContextMenuProvider } from '../features/shortcuts/context-menu-context'
import { ShortcutProvider } from '../features/shortcuts/global-shortcut-provider'

import { AppLayoutManager } from '../components/layout/app-layout-manager'
import { AuthModalProvider } from '../components/auth/auth-modal-provider'

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
					submessage={error instanceof Error ? error.message : String(error)}
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

	return <>{children}</>
}

export function Providers({ children }: props) {
	return (
		<TooltipProvider delayDuration={0}>
			<SonnerToaster />
			<AuthModalProvider disabled>
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
			</AuthModalProvider>
		</TooltipProvider>
	)
}
