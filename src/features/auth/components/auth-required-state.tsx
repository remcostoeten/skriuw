"use client";

import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/shared/ui/button-component";

type Props = {
  title: string;
  description: string;
};

export function AuthRequiredState({ title, description }: Props) {
  const router = useRouter();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md border border-border bg-card p-6 shadow-sm sm:p-7">
        <div className="flex h-11 w-11 items-center justify-center border border-border bg-background text-foreground/78">
          <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="mt-5 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div className="mt-6">
          <Button className="w-full" onClick={() => router.push("/sign-up")}>
            Sign up
          </Button>
        </div>
      </div>
    </div>
  );
}