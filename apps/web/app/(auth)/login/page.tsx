"use client";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@skriuw/ui";
import { ChevronLeftIcon } from "lucide-react";
import { MeshBlob } from "@/features/authentication/components/mesh-blob";
import { LoginForm } from "@/features/authentication/components/login-form";
// import { FloatingPaths } from "@/features/authentication/components/floating-paths";
import Link from "next/link";

export default function AuthPage() {
    return (
        <main className="relative min-h-screen w-full md:grid md:grid-cols-2 md:h-screen md:overflow-hidden bg-background">

            {/* Left Side (Hidden on mobile) */}
            <div className="relative hidden h-full flex-col border-r bg-secondary p-10 md:flex dark:bg-secondary/20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background z-10" />
                <div className="z-20">
                    <BrandLogo className="mr-auto h-12 w-auto" size={48} variant="sidebar" />
                </div>

                <div className="z-20 mt-auto">
                    <blockquote className="space-y-2">
                        <p className="text-xl">
                            &ldquo;This Platform has helped me to save time and serve my
                            clients faster than ever before.&rdquo;
                        </p>
                        <footer className="font-mono font-semibold text-sm">
                            ~ Ali Hassan
                        </footer>
                    </blockquote>
                </div>
                <div className="absolute inset-0 z-0">
                    <MeshBlob />
                </div>
            </div>

            {/* Right Side */}
            <div className="relative flex min-h-screen flex-col justify-center p-4">
                {/* Background Blobs */}
                <div
                    aria-hidden
                    className="-z-10 absolute inset-0 isolate opacity-60 contain-strict overflow-hidden"
                >
                    <div className="-translate-y-87.5 absolute top-0 right-0 h-[80rem] w-[35rem] rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsl(var(--foreground)/0.06)_0,hsla(0,0%,55%,.02)_50%,hsl(var(--foreground)/0.01)_80%)]" />
                    <div className="absolute top-0 right-0 h-[80rem] w-[15rem] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--foreground)/0.04)_0,hsl(var(--foreground)/0.01)_80%,transparent_100%)] [translate:5%_-50%]" />
                    <div className="-translate-y-87.5 absolute top-0 right-0 h-[80rem] w-[15rem] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsl(var(--foreground)/0.04)_0,hsl(var(--foreground)/0.01)_80%,transparent_100%)]" />
                </div>

                <Button asChild className="absolute top-8 left-8 z-30" variant="outline">
                    <Link href="/">
                        <ChevronLeftIcon className="w-4 h-4 mr-2" />
                        Back Home
                    </Link>
                </Button>

                <div className="mx-auto w-full max-w-sm space-y-8">
                    <div className="lg:hidden">
                        <BrandLogo className="h-10 w-auto" size={40} variant="sidebar" />
                    </div>

                    {/* We inject the existing LoginForm here, but we pass title/subtitle props to match the new design text if possible, or just let LoginForm handle it. 
                       The user asked for "Sign In or Join Now!", "login or create your efferd account."
                   */}
                    <LoginForm
                        title="Sign In or Join Now!"
                        subtitle="login or create your efferd account."
                    />

                </div>
            </div>
        </main>
    );
}
