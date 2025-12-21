'use client'

import { SkriuwExplanation } from '@/components/landing/skriuw-explanation'
import { IdentityGuardExample } from '@/examples/identity-guard-usage'
import { useState } from 'react'

export default function DemoPage() {
    const [showIdentityGuard, setShowIdentityGuard] = useState(false)

    return (
        <div className="min-h-screen bg-background text-foreground">
            {showIdentityGuard ? (
                <div className="container mx-auto py-8">
                    <div className="mb-8 text-center">
                        <button
                            onClick={() => setShowIdentityGuard(false)}
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
                        onCreateNote={() => setShowIdentityGuard(true)}
                    />
                </div>
            )}
        </div>
    )
}