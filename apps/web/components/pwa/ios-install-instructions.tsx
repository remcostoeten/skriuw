"use client";

import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@skriuw/ui/drawer";
import { Button } from "@skriuw/ui/button";
import { Share, SquarePlus } from "lucide-react";
import { cn } from "@skriuw/shared";

export function IosInstallInstructions({
    isOpen,
    onOpenChange,
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const steps = [
        {
            icon: Share,
            iconColor: "text-blue-400",
            iconBg: "bg-blue-500/10 ring-blue-500/20",
            title: "Tap the Share button",
            description: "Usually found at the bottom of standard bottom bar.",
        },
        {
            icon: SquarePlus,
            iconColor: "text-white",
            iconBg: "bg-white/10 ring-white/10",
            title: 'Select "Add to Home Screen"',
            description: "Scroll down in the share menu to find it.",
        },
    ];

    return (
        <Drawer open={isOpen} onOpenChange={onOpenChange}>
            <DrawerContent className="bg-[#0f0f0f] border-white/[0.06]">
                <DrawerHeader className="pb-2">
                    <DrawerTitle className="text-lg font-semibold text-white">
                        Install Skriuw on iOS
                    </DrawerTitle>
                </DrawerHeader>

                <div className="px-4 pb-2 space-y-4">
                    {steps.map((step, index) => (
                        <div
                            key={step.title}
                            className={cn(
                                "flex items-start gap-4 p-3 rounded-xl",
                                "bg-white/[0.03] border border-white/[0.04]"
                            )}
                        >
                            <div className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center",
                                "rounded-xl ring-1",
                                step.iconBg
                            )}>
                                <step.icon className={cn("h-5 w-5", step.iconColor)} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-white">
                                    {index + 1}. {step.title}
                                </p>
                                <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
                                    {step.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <DrawerFooter className="pt-2">
                    <Button
                        onClick={() => onOpenChange(false)}
                        className={cn(
                            "w-full h-11 text-sm font-semibold rounded-xl",
                            "bg-white text-black hover:bg-white/90"
                        )}
                    >
                        Got it
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
