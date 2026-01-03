"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ShareTargetPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const title = searchParams.get("title") || "";
        const text = searchParams.get("text") || "";
        const url = searchParams.get("url") || "";

        // Combine shared data
        const combinedText = [title, text, url].filter(Boolean).join("\n\n");

        if (combinedText) {
            // Encode and redirect to home with action=new and shared data
            const params = new URLSearchParams();
            params.set("action", "new");
            params.set("content", combinedText);
            router.replace(`/?${params.toString()}`);
        } else {
            router.replace("/");
        }
    }, [router, searchParams]);

    return (
        <div className="flex h-screen items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Processing shared content...</div>
        </div>
    );
}
