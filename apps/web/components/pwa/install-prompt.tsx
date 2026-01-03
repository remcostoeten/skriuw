"use client";

import { useEffect, useState } from "react";
import { Button } from "@skriuw/ui/button";
import { Download, X } from "lucide-react";
import { IosInstallInstructions } from "./ios-install-instructions";
import { cn } from "@skriuw/shared";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIos, setIsIos] = useState(false);
    const [showIosInstructions, setShowIosInstructions] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(true); // Default to true until checked

    useEffect(() => {
        // 1. Check if already installed
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
        if (isStandalone) return;

        // 2. Check for dismissal
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
            const now = Date.now();
            if (now - parseInt(dismissedAt) < DISMISS_DURATION) {
                return;
            }
        }
        setIsDismissed(false);

        // 3. Check for iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIos(isIosDevice);

        if (isIosDevice) {
            setIsVisible(true);
        }

        // 4. Check for Android/Desktop (beforeinstallprompt)
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (isIos) {
            setShowIosInstructions(true);
        } else if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                setDeferredPrompt(null);
                setIsVisible(false);
            }
        }
    };

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        setIsVisible(false);
    };

    if (!isVisible || isDismissed) return null;

    return (
        <>
            {/* On mobile/small screens, show as a banner above the footer. On desktop, show as a floating button. */}
            <div className={cn(
                "fixed z-[100] transition-all duration-300 ease-in-out",
                // Mobile/Small: Full width banner above footer (footer height is ~2.25rem + safe area)
                "bottom-[calc(2.25rem+env(safe-area-inset-bottom)+8px)] left-4 right-4 sm:left-auto sm:right-6 sm:bottom-12 sm:w-auto"
            )}>
                <div className="flex items-center gap-3 bg-card border border-border p-3 sm:p-2 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Download className="h-5 w-5" />
                    </div>

                    <div className="flex flex-col gap-0.5 pr-2">
                        <p className="text-sm font-semibold leading-tight">Install Skriuw</p>
                        <p className="text-[11px] text-muted-foreground leading-tight hidden xs:block">Use as a desktop or mobile application</p>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                        <Button
                            size="sm"
                            onClick={handleInstallClick}
                            className="h-8 px-3 text-xs font-medium"
                        >
                            Install
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleDismiss}
                            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                            aria-label="Maybe later"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <IosInstallInstructions
                isOpen={showIosInstructions}
                onOpenChange={setShowIosInstructions}
            />
        </>
    );
}

