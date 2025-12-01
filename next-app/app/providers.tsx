'use client'

import { AlertCircle } from "lucide-react"
import { ReactNode, useEffect, useState } from "react"

import { EmptyState } from "@/shared/ui/empty-state"

import { SettingsProvider } from "@/features/settings"
import { EditorTabsProvider } from "@/features/editor/tabs"
import { ContextMenuProvider } from "@/features/shortcuts/context-menu-context"
import { ShortcutProvider } from "@/features/shortcuts/global-shortcut-provider"

import { AppLayoutLoadingSkeleton } from "@/components/layout/app-layout-loading"

import { AppLayoutManager } from "@/components/layout/app-layout-manager"
import { TooltipProvider } from "@/shared/ui"
import { initializeAppStorage } from "@/app/storage"
import { Toaster as SonnerToaster } from "sonner"
import { SplashScreen } from "@/components/splash-screen"

type props = {
	children: ReactNode
}

function StorageInitializer({ children }: props) {
	const [isInitialized, setIsInitialized] = useState(false)
	const [showSplash, setShowSplash] = useState(true)
	const [storageReady, setStorageReady] = useState(false)
	const [animationComplete, setAnimationComplete] = useState(false)
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		let isMounted = true
		const timeoutId = setTimeout(() => {
			if (isMounted && !storageReady) {
				console.warn("Storage initialization taking too long, showing app anyway")
				setStorageReady(true)
				setIsInitialized(true)
			}
		}, 5000) // 5 second timeout

		initializeAppStorage()
			.then(() => {
				if (isMounted) {
					console.log("✅ Storage initialized successfully")
					clearTimeout(timeoutId)
					setStorageReady(true)
					setIsInitialized(true)
					setError(null)
				}
			})
			.catch((err) => {
				if (isMounted) {
					console.error("Failed to initialize storage:", err)
					clearTimeout(timeoutId)
					setError(err instanceof Error ? err : new Error(String(err)))
					// Still show app even if storage fails
					setStorageReady(true)
					setIsInitialized(true)
				}
			})

		return () => {
			isMounted = false
			clearTimeout(timeoutId)
		}
	}, [storageReady])

	// Hide splash screen when both animation and storage are ready
	useEffect(() => {
		if (animationComplete && storageReady) {
			// Small delay to ensure data is loaded
			setTimeout(() => {
				setShowSplash(false)
			}, 300)
		}
	}, [animationComplete, storageReady])

	const handleAnimationComplete = () => {
		setAnimationComplete(true)
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center min-h-screen bg-background">
				<EmptyState
					message="Storage initialization failed"
					submessage={error.message}
					icon={<AlertCircle className="h-8 w-8 text-destructive" />}
					actions={[
						{
							label: "Refresh page",
							onClick: () => window.location.reload(),
						},
					]}
				/>
			</div>
		)
	}

	return (
		<>
			{isInitialized ? children : <AppLayoutLoadingSkeleton />}
			<SplashScreen 
				show={showSplash} 
				onAnimationComplete={handleAnimationComplete}
			/>
		</>
	)
}

export function Providers({ children }: props) {
	return (
		<TooltipProvider delayDuration={0}>
			<SonnerToaster />
			<StorageInitializer>
				<SettingsProvider>
					<ShortcutProvider>
						<ContextMenuProvider>
							<EditorTabsProvider>
								<AppLayoutManager>{children}</AppLayoutManager>
							</EditorTabsProvider>
						</ContextMenuProvider>
					</ShortcutProvider>
				</SettingsProvider>
			</StorageInitializer>
		</TooltipProvider>
	)
}
