import { AlertCircle } from "lucide-react"
import { ReactNode, useEffect, useState } from "react"

import { EmptyState } from "@/shared/ui/empty-state"

import { SettingsProvider } from "@/features/settings"
import { EditorTabsProvider } from "@/features/editor/tabs"
import { StorageOnboarding } from "@/features/storage-onboarding"
import { ContextMenuProvider } from "@/features/shortcuts/context-menu-context"
import { ShortcutProvider } from "@/features/shortcuts/global-shortcut-provider"

import { AppLayoutLoadingSkeleton } from "@/components/layout/app-layout-loading"

import { Sonner, Toaster, TooltipProvider } from "ui"

import { initializeAppStorage } from "../storage"
import type { StorageConfig } from "../storage/config"
import { getStorageConfig, persistStorageConfig, resetStorageConfig } from "../storage/config"

type props = {
        children: ReactNode
}

function StorageInitializer({ children }: props) {
        const [isInitialized, setIsInitialized] = useState(false)
        const [error, setError] = useState<Error | null>(null)
        const [config, setConfig] = useState<StorageConfig | null>(() => getStorageConfig())

        useEffect(() => {
                if (!config) return

                initializeAppStorage(config)
                        .then(() => {
                                setIsInitialized(true)
                                setError(null)
                        })
                        .catch(err => {
                                console.error("Failed to initialize storage:", err)
                                setError(err instanceof Error ? err : new Error(String(err)))
                                setIsInitialized(false)
                        })
        }, [config])

        const handleSelect = (selected: StorageConfig) => {
                persistStorageConfig(selected)
                setConfig(selected)
        }

        const handleReset = () => {
                resetStorageConfig()
                setConfig(null)
                setIsInitialized(false)
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
                                                        onClick: () => window.location.reload()
                                                },
                                                {
                                                        label: "Re-pick storage",
                                                        onClick: handleReset
                                                }
                                        ]}
                                />
                        </div>
                )
        }

        if (!config) {
                return <StorageOnboarding onSelect={handleSelect} />
        }

        if (!isInitialized) {
                return <AppLayoutLoadingSkeleton />
        }

        return <>{children}</>
}

export function Providers({ children }: props) {
        return (
                <SettingsProvider>
                        <ShortcutProvider>
                                <ContextMenuProvider>
                                        <TooltipProvider delayDuration={0}>
                                                <Toaster />
                                                <Sonner />
                                                <StorageInitializer>
                                                        <EditorTabsProvider>{children}</EditorTabsProvider>
                                                </StorageInitializer>
                                        </TooltipProvider>
                                </ContextMenuProvider>
                        </ShortcutProvider>
                </SettingsProvider>
        )
}
