'use client'

import * as React from 'react'
import { motion, SVGMotionProps } from 'framer-motion'
import { cn } from '@skriuw/shared'

interface BrandLogoProps extends SVGMotionProps<SVGSVGElement> {
    size?: number
    animated?: boolean
    className?: string
    variant?: 'sidebar' | 'explanation'
}

export function BrandLogo({
    size = 120,
    animated = true,
    className,
    variant = 'explanation',
    ...props
}: BrandLogoProps) {
    const variants = {
        hidden: { opacity: 0, scale: 0.8 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: {
                duration: 0.5,
                ease: [0.4, 0, 0.2, 1] as const,
                staggerChildren: 0.1,
            },
        },
        hover: {
            scale: 1, // Reset scale or keep 1
            transition: {
                staggerChildren: 0.1,
            },
        },
    }

    const pathVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
        hover: {
            opacity: [1, 0.5, 1],
            transition: {
                duration: 0.6,
                ease: [0.4, 0, 0.2, 1] as const,
            },
        },
    }

    const isSidebar = variant === 'sidebar'

    const svgContent = (
        <g fill="currentColor">
            {isSidebar ? (
                <>
                    {/* First bar - leftmost */}
                    {animated ? (
                        <motion.rect x="4" y="8" width="8" height="24" rx="1" variants={pathVariants} />
                    ) : (
                        <rect x="4" y="8" width="8" height="24" rx="1" />
                    )}
                    {/* Second bar - middle */}
                    {animated ? (
                        <motion.rect x="16" y="4" width="8" height="32" rx="1" variants={pathVariants} />
                    ) : (
                        <rect x="16" y="4" width="8" height="32" rx="1" />
                    )}
                    {/* Third bar - rightmost */}
                    {animated ? (
                        <motion.rect x="28" y="12" width="8" height="16" rx="1" variants={pathVariants} />
                    ) : (
                        <rect x="28" y="12" width="8" height="16" rx="1" />
                    )}
                </>
            ) : (
                <>
                    {/* Left Shape */}
                    {animated ? (
                        <motion.path
                            d="M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z"
                            variants={pathVariants}
                        />
                    ) : (
                        <path
                            d="M6 52 L0 58 L0 391 L8 400 L82 440 L89 441 L94 439 L99 432 L99 104 L94 96 L14 52 Z"
                        />
                    )}
                    {/* Middle Shape */}
                    {animated ? (
                        <motion.path
                            d="M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z"
                            variants={pathVariants}
                        />
                    ) : (
                        <path
                            d="M133 0 L123 8 L123 504 L130 511 L140 512 L237 463 L246 452 L246 64 L234 52 L150 6 Z"
                        />
                    )}
                    {/* Right Shape */}
                    {animated ? (
                        <motion.path
                            d="M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z"
                            variants={pathVariants}
                        />
                    ) : (
                        <path
                            d="M277 78 L272 83 L272 434 L278 440 L288 440 L378 391 L390 380 L390 139 L379 128 L299 78 Z"
                        />
                    )}
                </>
            )}
        </g>
    )

    const commonSvgProps = {
        viewBox: isSidebar ? "0 0 40 40" : "0 0 390 513",
        width: size,
        height: size,
        preserveAspectRatio: "xMidYMid meet",
        className: cn('text-foreground', className),
    }

    // Filter props to remove motion-specific ones for non-animated SVG
    const { initial, animate, whileHover, variants: variantsProp, transition, ...filteredProps } = props as any

    if (animated) {
        return (
            <motion.svg
                {...commonSvgProps}
                {...props}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                variants={variants}
            >
                {svgContent}
            </motion.svg>
        )
    }

    return (
        <svg {...commonSvgProps} {...filteredProps} xmlns="http://www.w3.org/2000/svg">
            {svgContent}
        </svg>
    )
}
