'use client'

import SkriuwEffect from "@/features/authentication/components/effects/skriuw-effect";
import { LoginForm } from "@/features/authentication/components/login-form";
import { useState, useEffect } from "react";
import AuthLayout from "../auth-layout";

const ActiveEffect = SkriuwEffect;

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
            visualPanel={<ActiveEffect />}
            formPanel={
                <LoginForm
                    isDark={isDark}
                    onToggleTheme={toggleTheme}
                />
            }
            reversed={false}
        />
    );
};

export default Index;
