
'use client'

import { useInstallPrompt } from "../hooks"
import { InstallBanner } from "./InstallBanner"
import { InstallInstructions } from "./InstallInstructions"

export function InstallController() {
    const {
        showBanner,
        showInstructions,
        platform,
        triggerInstall,
        dismiss,
        closeInstructions
    } = useInstallPrompt()

    if (!showBanner && !showInstructions) return null

    return (
        <>
            {showBanner && (
                <InstallBanner
                    platform={platform}
                    onInstall={triggerInstall}
                    onDismiss={dismiss}
                />
            )}
            <InstallInstructions
                isOpen={showInstructions}
                onOpenChange={(open) => !open && closeInstructions()}
            />
        </>
    )
}
