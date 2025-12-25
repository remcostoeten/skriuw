'use client'

import { useEffect, useCallback } from 'react'
import { useSession } from '@/lib/auth-client'
import { BrandLogo } from '@/components/brand-logo'
import { MeshBlob } from '@/features/authentication/components/mesh-blob'
import { LoginForm } from '@/features/authentication/components/login-form'
import {
    DrawerDialog,
    DrawerContent,
    DrawerClose,
} from '@skriuw/ui/dialog-drawer'

type AuthModalProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    action?: string // The action that triggered auth
}

export function AuthModal({ open, onOpenChange, action }: AuthModalProps) {
    const { data: session } = useSession()

    const handleSuccess = useCallback(() => {
        onOpenChange(false)
    }, [onOpenChange])

    // Auto-close when user becomes authenticated
    useEffect(() => {
        if (session && open) {
            onOpenChange(false)
        }
    }, [session, open, onOpenChange])

    return (
        <DrawerDialog open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="flex flex-col p-0 overflow-hidden">
                <DrawerClose aria-label="Close authentication" />
                <div className="flex flex-row flex-1 min-h-0 mx-auto w-full h-full">
                    {/* Left decorative panel - hidden on mobile */}
                    <aside className="relative hidden md:flex flex-col flex-1 border-r border-border/50 bg-secondary/20 p-10 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background z-10 pointer-events-none" />

                        <div className="z-20">
                            <BrandLogo className="mr-auto h-12 w-auto" size={48} variant="sidebar" />
                        </div>

                        <div className="z-20 mt-auto">
                            <blockquote className="space-y-2">
                                <p className="text-lg text-foreground/80">
                                    &ldquo;Your notes, your way. Simple, clean, and distraction-free.&rdquo;
                                </p>
                                <footer className="font-mono font-medium text-sm text-muted-foreground">
                                    ~ skriuw
                                </footer>
                            </blockquote>
                        </div>

                        {/* MeshBlob background */}
                        <div className="absolute inset-0 z-0">
                            <MeshBlob />
                        </div>
                    </aside>

                    {/* Right content area with login form */}
                    <div className="flex-1 md:flex-none md:w-[480px] flex items-center justify-center p-8 overflow-y-auto bg-background">
                        <LoginForm
                            title="Welcome to skriuw"
                            subtitle={action ? `Sign in to ${action.replace('-', ' ')}` : "Sign in to continue to your notes"}
                            onSuccess={handleSuccess}
                        />
                    </div>
                </div>
            </DrawerContent>
        </DrawerDialog>
    )
}
