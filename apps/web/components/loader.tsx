'use client'

import { motion } from 'framer-motion'

type Props = {
    size?: number
}

export function Loader(props: Props) {
    const size = props.size ?? 120

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-neutral-950">
            <motion.svg
                width={size}
                height={size}
                viewBox="0 0 120 120"
                fill="none"
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 1 }}
            >
                <defs>
                    <linearGradient id="grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="120">
                        <stop offset="0%" stopColor="#ff3b3b" />
                        <stop offset="35%" stopColor="#ff9f1c" />
                        <stop offset="65%" stopColor="#3ddc84" />
                        <stop offset="100%" stopColor="#4dabf7" />
                    </linearGradient>
                </defs>

                <motion.path
                    d="M60 10C34 10 20 28 20 50c0 18 10 30 28 38l-6 14c-2 4 2 8 6 6l22-10 22 10c4 2 8-2 6-6l-6-14c18-8 28-20 28-38 0-22-14-40-40-40z"
                    stroke="url(#grad)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="240"
                    strokeDashoffset="240"
                    animate={{ strokeDashoffset: 0 }}
                    transition={{
                        duration: 1.6,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        repeatType: 'loop'
                    }}
                />
            </motion.svg>
        </div>
    )
}

