"use client";
import { useSession, signOut } from "@/lib/auth-client";
import { Loader2, User, LogOut, X } from "lucide-react";
import { useState } from "react";
import { SignInView } from "./sign-in-view";

export function UserMenu() {
    const { data: session, isPending } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    if (isPending) {
        return (
            <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        );
    }

    if (!session) {
        return (
            <>
                <button
                    onClick={() => setIsOpen(true)}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-9 px-4 py-2 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90"
                >
                    Sign In
                </button>

                {isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="relative w-full max-w-md">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute right-4 top-4 z-10 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-zinc-100 data-[state=open]:text-zinc-500 dark:ring-offset-zinc-950 dark:focus:ring-zinc-300 dark:data-[state=open]:bg-zinc-800 dark:data-[state=open]:text-zinc-400"
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close</span>
                            </button>
                            <SignInView />
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-800"
            >
                {session.user.image ? (
                    <img
                        src={session.user.image}
                        alt={session.user.name || "User"}
                        className="aspect-square h-full w-full"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <User className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                    </div>
                )}
            </button>

            {showMenu && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="px-2 py-1.5 text-sm font-semibold">
                        {session.user.name}
                    </div>
                    <div className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {session.user.email}
                    </div>
                    <div className="h-px my-1 bg-zinc-100 dark:bg-zinc-800" />
                    <button
                        onClick={() => signOut()}
                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                    </button>
                </div>
            )}
        </div>
    );
}
