'use client'

import { useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { BrandLogo } from '@/components/brand-logo'
import { FloatingPaths } from '@/features/authentication/components/floating-paths'
import { LoginForm } from '@/features/authentication/components/login-form'
import {
    DrawerDialog,
    DrawerContent,
    DrawerClose,
} from '@skriuw/ui/dialog-drawer'

type AuthModalProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
    const { data: session } = useSession()

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
                <div className="flex flex-row flex-1 min-h-0 max-w-5xl mx-auto w-full h-full">
                    {/* Left decorative panel - hidden on mobile */}
                    <aside className="relative hidden md:flex flex-col min-w-[350px] max-w-[350px] border-r border-border/50 bg-secondary/20 p-10 overflow-hidden">
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

                        {/* Floating paths background */}
                        <div className="absolute inset-0 z-0">
                            <FloatingPaths position={1} />
                            <FloatingPaths position={-1} />
                        </div>
                    </aside>

                    {/* Right content area with login form */}
                    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto bg-background">
                        <LoginForm
                            title="Welcome to skriuw"
                            subtitle="Sign in to continue to your notes"
                            onSuccess={() => onOpenChange(false)}
                        />
                    </div>
                </div>
            </DrawerContent>
        </DrawerDialog>
    )
}
