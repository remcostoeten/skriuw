"use client"

import Link from 'next/link'
import { useSession, signOut } from '@/lib/auth-client'
import { User, LogOut, UserRoundCog } from 'lucide-react'

import { Button, buttonVariants } from '@skriuw/ui/button'
import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
} from '@skriuw/ui/dropdown-menu'
import { useAuthModal } from './auth-modal-provider'

export function UserMenu() {
        const { data: session, isPending } = useSession()
        const { open: openAuthModal } = useAuthModal()

        if (isPending) {
                return <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
        }

        if (!session) {
                return (
                        <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                onClick={openAuthModal}
                        >
                                Sign In
                        </Button>
                )
        }


        return (
                <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                                <button className="relative flex h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border ring-offset-background transition-all">
                                        {session.user.image ? (
                                                <img
                                                        src={session.user.image}
                                                        alt={session.user.name || 'User'}
                                                        className="aspect-square h-full w-full object-cover"
                                                />
                                        ) : (
                                                <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                        )}
                                </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-72 p-2 shadow-lg">
                                <DropdownMenuLabel className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                                {session.user.image ? (
                                                        <img
                                                                src={session.user.image}
                                                                alt={session.user.name || 'User'}
                                                                className="h-full w-full rounded-full object-cover"
                                                        />
                                                ) : (
                                                        <User className="h-5 w-5 text-muted-foreground" />
                                                )}
                                        </div>
                                        <div className="min-w-0">
                                                <p className="text-sm font-semibold leading-tight text-foreground">
                                                        {session.user.name || 'Unnamed user'}
                                                </p>
                                                {session.user.email && (
                                                        <p className="text-xs text-muted-foreground line-clamp-1">{session.user.email}</p>
                                                )}
                                        </div>
                                </DropdownMenuLabel>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                                        <Link href="/profile" className="flex w-full items-center">
                                                <UserRoundCog className="h-4 w-4 text-muted-foreground" />
                                                <span className="ml-2">Profile &amp; preferences</span>
                                        </Link>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                        onSelect={(event) => {
                                                event.preventDefault()
                                                signOut()
                                        }}
                                        className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                                >
                                        <LogOut className="h-4 w-4" />
                                        <span className="ml-2">Log out</span>
                                </DropdownMenuItem>
                        </DropdownMenuContent>
                </DropdownMenu>
        )
}
