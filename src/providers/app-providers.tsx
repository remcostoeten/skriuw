"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { MotionConfig } from "framer-motion"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { PersistenceBootstrap } from "@/providers/persistence-bootstrap"
import { ShortcutProvider, type ShortcutHandlers } from "@/core/shortcuts"
import { useRouter } from "next/navigation"
import { signOut } from "@/platform/auth"

type Props = {
  children: React.ReactNode
}

function ShortcutHandlerProvider({ children }: Props) {
  const router = useRouter()

  const handlers: ShortcutHandlers = {
    profile: () => router.push("/app/profile"),
    notes: () => router.push("/app"),
    journal: () => router.push("/app/journal"),
    activity: () => router.push("/app/activity"),
    settings: () => router.push("/app/settings"),
    signOut: async () => {
      try {
        await signOut()
        window.location.assign("/sign-in")
      } catch (error) {
        console.error("Shortcut sign-out failed", error)
      }
    },
  }

  return <ShortcutProvider handlers={handlers}>{children}</ShortcutProvider>
}

export function AppProviders({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={300}>
            <PersistenceBootstrap />
            <ShortcutHandlerProvider>{children}</ShortcutHandlerProvider>
          </TooltipProvider>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}