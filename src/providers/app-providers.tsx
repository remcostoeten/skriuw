"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { PerformanceMonitor } from "@/shared/components/performance-monitor";
import { PersistenceBootstrap } from "@/shared/components/persistence-bootstrap";

type Props = {
  children: React.ReactNode;
};

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
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <TooltipProvider delayDuration={300}>
            <PerformanceMonitor />
            <PersistenceBootstrap />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
