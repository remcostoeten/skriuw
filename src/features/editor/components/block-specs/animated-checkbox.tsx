"use client";

import { motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";

const GOOEY_BEZIER = [0.16, 1.4, 0.3, 1] as const;

type Props = {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export function AnimatedCheckbox({ checked, onChange }: Props) {
    return (
        <motion.button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex items-center justify-center",
                "w-4.5 h-4.5  rounded-lg",
                "shrink-0 outline-none",
                "focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2",
            )}
            initial={false}
            animate={{
                borderColor: "hsl(var(--foreground))",
                borderWidth: 2,
            }}
            transition={{
                duration: 0.36,
                ease: GOOEY_BEZIER,
            }}
            style={{
                borderStyle: "solid",
            }}
        >
            {/* background fill */}
            <motion.div
                className="absolute inset-[2px] rounded-[2px]"
                initial={false}
                animate={{
                    opacity: checked ? 1 : 0,
                    scale: checked ? 1 : 0.6,
                }}
                style={{ backgroundColor: "hsl(var(--foreground))" }}
                transition={{
                    duration: 0.36,
                    ease: GOOEY_BEZIER,
                }}
            />

            {/* checkmark svg */}
            <motion.svg
                viewBox="0 0 16 16"
                className="relative z-10"
                style={{
                    width: 11,
                    height: 11,
                    stroke: "hsl(var(--background))",
                }}
            >
                <motion.path
                    d="M3 8.5L6.5 12L13 4"
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{
                        pathLength: checked ? 1 : 0,
                        opacity: checked ? 1 : 0,
                    }}
                    transition={{
                        duration: 0.36,
                        ease: GOOEY_BEZIER,
                    }}
                />
            </motion.svg>
        </motion.button>
    );
}
