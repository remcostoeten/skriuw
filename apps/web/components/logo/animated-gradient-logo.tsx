'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@skriuw/shared'

interface AnimatedGradientLogoProps extends React.SVGProps<SVGSVGElement> {
    size?: number
    className?: string
    animated?: boolean
}

export function AnimatedGradientLogo({
    size = 120,
    className,
    animated = true,
    ...props
}: AnimatedGradientLogoProps) {
    const gradientId = React.useId()
    
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            className={cn('select-none', className)}
            {...props}
        >
            <defs>
                {/* Animated rainbow gradient */}
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF0000">
                        {animated && (
                            <animate
                                attributeName="stop-color"
                                values="#FF0000;#FF7F00;#FFFF00;#00FF00;#0000FF;#4B0082;#9400D3;#FF0000"
                                dur="4s"
                                repeatCount="indefinite"
                            />
                        )}
                    </stop>
                    <stop offset="50%" stopColor="#00FF00">
                        {animated && (
                            <animate
                                attributeName="stop-color"
                                values="#00FF00;#0000FF;#4B0082;#9400D3;#FF0000;#FF7F00;#FFFF00;#00FF00"
                                dur="4s"
                                repeatCount="indefinite"
                            />
                        )}
                    </stop>
                    <stop offset="100%" stopColor="#9400D3">
                        {animated && (
                            <animate
                                attributeName="stop-color"
                                values="#9400D3;#FF0000;#FF7F00;#FFFF00;#00FF00;#0000FF;#4B0082;#9400D3"
                                dur="4s"
                                repeatCount="indefinite"
                            />
                        )}
                    </stop>
                </linearGradient>

                {/* Define the logo bars as a mask */}
                <mask id="logoMask">
                    <rect width="512" height="512" fill="white" />
                    <g fill="black">
                        {/* First bar - leftmost */}
                        <rect x="154" y="184" width="62" height="144" rx="8" />
                        {/* Second bar - middle */}
                        <rect x="225" y="128" width="62" height="256" rx="8" />
                        {/* Third bar - rightmost */}
                        <rect x="296" y="208" width="62" height="96" rx="8" />
                    </g>
                </mask>

                {/* Shield shape path */}
                <clipPath id="shieldClip">
                    <path d="M256 32L448 128V256C448 368 352 448 256 480C160 448 64 368 64 256V128L256 32Z" />
                </clipPath>
            </defs>

            {/* Dark shield background */}
            <path
                d="M256 32L448 128V256C448 368 352 448 256 480C160 448 64 368 64 256V128L256 32Z"
                fill="#1a1a2e"
                stroke="#16213e"
                strokeWidth="4"
            />

            {/* Animated gradient logo bars masked by shield */}
            <g clipPath="url(#shieldClip)">
                <rect
                    x="0"
                    y="0"
                    width="512"
                    height="512"
                    fill={`url(#${gradientId})`}
                    mask="url(#logoMask)"
                />
            </g>

            {/* Optional subtle glow effect */}
            {animated && (
                <motion.path
                    d="M256 32L448 128V256C448 368 352 448 256 480C160 448 64 368 64 256V128L256 32Z"
                    fill="none"
                    stroke="url(#gradientId)"
                    strokeWidth="2"
                    opacity={0.3}
                    animate={{
                        opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            )}
        </svg>
    )
}
