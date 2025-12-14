'use client'

import GhostCursor from "@/features/authentication/components/effects/ghost-cursor";
import { LoginForm } from "@/features/authentication/components/login-form";
import { useState, useEffect } from "react";
import AuthLayout from "../auth-layout";

const Index = () => {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // Check system preference on mount
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setIsDark(prefersDark);
    }, []);

    useEffect(() => {
        // Apply theme class to document
        if (isDark) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(!isDark);

    return (
        <AuthLayout
            effectLayer={
                <div className="w-full h-full bg-[hsl(225,25%,8%)]">
                    <GhostCursor
                        color="#4A6FE3"
                        brightness={2.2}
                        edgeIntensity={0}
                        trailLength={80}
                        inertia={0.5}
                        grainIntensity={0.03}
                        bloomStrength={0.7}
                        bloomRadius={2.0}
                        bloomThreshold={0.01}
                        fadeDelayMs={1500}
                        fadeDurationMs={2000}
                        mixBlendMode="screen"
                        trackGlobally={true}
                    />
                </div>
            }
            formPanel={
                <LoginForm
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                />
            }
        />
    );
};

export default Index;
