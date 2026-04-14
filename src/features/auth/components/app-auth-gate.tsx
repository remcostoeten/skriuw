"use client";

import { useEffect } from "react";
import { initializeAuth } from "@/platform/auth";

type Props = {
  children: React.ReactNode;
};

export function AppAuthGate({ children }: Props) {
  useEffect(() => {
    void initializeAuth();
  }, []);

  return <>{children}</>;
}
