"use client";

import { useEffect, useState } from "react";
import { Button } from "@skriuw/ui/button";
import { Download, X } from "lucide-react";
import { IosInstallInstructions } from "./ios-install-instructions";
import { cn } from "@skriuw/shared";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000;

type PromptChoice = {
    outcome: "accepted" | "dismissed";
    platform: string;
};

type PromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<PromptChoice>;
};

type StandaloneNav = Navigator & {
    standalone?: boolean;
};

export function InstallPrompt() {
    const [deferredPrompt, setPrompt] = useState<PromptEvent | null>(null);
    const [isIos, setIos] = useState(false);
    const [iosOpen, setOpen] = useState(false);
    const [isVisible, setVisible] = useState(false);
    const [isDismissed, setDismissed] = useState(true);

    useEffect(() => {
        const nav = window.navigator as StandaloneNav;
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
        if (isStandalone) return;

        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (dismissedAt) {
            const now = Date.now();
            if (now - parseInt(dismissedAt) < DISMISS_DURATION) {
                return;
            }
        }
        setDismissed(false);

        const userAgent = window.navigator.userAgent.toLowerCase();
        const iosMatch = /iphone|ipad|ipod/.test(userAgent);
        setIos(iosMatch);

        if (iosMatch) {
            setVisible(true);
        }

        function onPrompt(event: Event) {
            if (!("prompt" in event)) return;
            const promptEvent = event as PromptEvent;
            promptEvent.preventDefault();
            setPrompt(promptEvent);
            setVisible(true);
        }

        window.addEventListener("beforeinstallprompt", onPrompt);

        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
        };
    }, []);

    async function onInstall() {
        if (isIos) {
            setOpen(true);
            setVisible(false);
        } else if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") {
                setPrompt(null);
                setVisible(false);
            }
        }
    }

    function onDismiss() {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        setVisible(false);
    }

    function onIos(open: boolean) {
        setOpen(open);
        setVisible(!open);
    }

    if (!isVisible || isDismissed) return null;

    return (
        <>
            <div className={cn(
                "fixed z-[60] transition-all duration-300 ease-out",
                "bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] left-3 right-3",
                "sm:left-auto sm:right-4 sm:bottom-20 sm:w-auto sm:max-w-[320px]"
            )}>
                <div className={cn(
                    "flex items-center gap-3",
                    "bg-[#1a1a1a] border border-white/[0.08]",
                    "p-3 rounded-2xl",
                    "shadow-[0_8px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]",
                    "animate-in fade-in slide-in-from-bottom-4 duration-300"
                )}>
                    <div className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center",
                        "rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10",
                        "ring-1 ring-emerald-500/30"
                    )}>
                        <Download className="h-5 w-5 text-emerald-400" />
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                        <p className="text-[13px] font-semibold text-white leading-tight">
                            Install Skriuw
                        </p>
                        <p className="text-[11px] text-white/50 leading-tight mt-0.5 truncate">
                            Better experience as an app
                        </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                            size="sm"
                            onClick={onInstall}
                            className={cn(
                                "h-9 px-4 text-xs font-semibold",
                                "bg-white text-black hover:bg-white/90",
                                "rounded-xl shadow-sm"
                            )}
                        >
                            Install
                        </Button>
                        <button
                            type="button"
                            onClick={onDismiss}
                            className={cn(
                                "flex items-center justify-center",
                                "h-9 w-9 rounded-xl",
                                "text-white/40 hover:text-white/70 hover:bg-white/5",
                                "transition-colors duration-150"
                            )}
                            aria-label="Dismiss"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <IosInstallInstructions
                isOpen={iosOpen}
                onOpenChange={onIos}
            />
        </>
    );
}
