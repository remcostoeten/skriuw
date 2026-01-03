"use client";

import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@skriuw/ui/drawer";
import { Button } from "@skriuw/ui/button";
import { Share, PlusSquare, X } from "lucide-react";
import { useState } from "react";

export function IosInstallInstructions({
    isOpen,
    onOpenChange,
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Drawer open={isOpen} onOpenChange={onOpenChange}>
            <DrawerContent>
                <DrawerHeader>
                    <DrawerTitle>Install Skriuw on iOS</DrawerTitle>
                </DrawerHeader>
                <div className="p-4 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <Share className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium">1. Tap the Share button</p>
                            <p className="text-xs text-muted-foreground">Usually found at the bottom of standard bottom bar.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <PlusSquare className="h-5 w-5 text-foreground" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium">2. Select "Add to Home Screen"</p>
                            <p className="text-xs text-muted-foreground">Scroll down in the share menu to find it.</p>
                        </div>
                    </div>
                </div>
                <DrawerFooter>
                    <Button onClick={() => onOpenChange(false)}>Got it</Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
