'use client'

import { SkriuwExplanation } from '@/components/landing/skriuw-explanation'
import { IdentityGuardExample } from '@/examples/identity-guard-usage'
import { useState, useCallback } from 'react'

export default function DemoPage() {
    const [showIdentityGuard, setShowIdentityGuard] = useState(false)

    const handleBackToSkriuw = useCallback(() => {
        setShowIdentityGuard(false)
    }, [])

    const handleCreateNote = useCallback(() => {
        setShowIdentityGuard(true)
    }, [])

    return (
        <div className="min-h-screen bg-background text-foreground">
            {showIdentityGuard ? (
                <div className="container mx-auto py-8">
                    <div className="mb-8 text-center">
                        <button
                            onClick={handleBackToSkriuw}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ← Back to Skriuw Intro
                        </button>
                    </div>
                    <IdentityGuardExample />
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center min-h-screen p-6">
                    <SkriuwExplanation
                        onCreateNote={handleCreateNote}
                    />
                </div>
            )}
        </div>
    )
}