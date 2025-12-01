import { AlertCircle } from "lucide-react"
import { ReactNode, useEffect, useState } from "react"

import { EmptyState } from "@/shared/ui/empty-state"

import { SettingsProvider } from "@/features/settings"
import { EditorTabsProvider } from "@/features/editor/tabs"
import { ContextMenuProvider } from "@/features/shortcuts/context-menu-context"
import { ShortcutProvider } from "@/features/shortcuts/global-shortcut-provider"

import { AppLayoutLoadingSkeleton } from "@/components/layout/app-layout-loading"

import { TooltipProvider } from "ui"
import { initializeAppStorage } from "../storage"
import { Toaster as SonnerToaster } from "sonner"
import { SplashScreen } from "@/components/splash-screen"

type props = {
	children: ReactNode
}

function StorageInitializer({ children }: props) {
	const [isInitialized, setIsInitialized] = useState(false)
	const [showSplash, setShowSplash] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	useEffect(() => {
		initializeAppStorage()
			.then(() => {
				setIsInitialized(true)
				setError(null)
			})
			.catch((err) => {
				console.error("Failed to initialize storage:", err)
				setError(err instanceof Error ? err : new Error(String(err)))
				setIsInitialized(false)
			})
	}, [])

	const handleAnimationComplete = () => {
		// Fade out splash screen when animation completes
		setShowSplash(false)
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
                                                        <EditorTabsProvider>{children}</EditorTabsProvider>
                                                </ContextMenuProvider>
                                        </ShortcutProvider>
                                </SettingsProvider>
                        </StorageInitializer>
                </TooltipProvider>
        )
}
