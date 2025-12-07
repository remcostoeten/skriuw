'use client'

import React from 'react'
import type { PreviewProps } from './index'

const SAMPLE_TEXT = `The quick brown fox jumps over the lazy dog.
1234567890
!@#$%^&*()_+`

type TypographyType = 'fontSize' | 'fontFamily' | 'lineHeight'

interface TypographyPreviewProps extends PreviewProps {
    type: TypographyType
}

const FONT_SIZES = {
    small: '12px',
    medium: '16px',
    large: '20px',
    'x-large': '24px',
}

const FONT_FAMILIES = {
    inter: '"Inter", system-ui, sans-serif',
    mono: '"Fira Code", monospace',
    serif: 'Georgia, serif',
    'sans-serif': 'system-ui, sans-serif',
}

export default function TypographyPreview({ value, type }: TypographyPreviewProps) {
    const getStyle = () => {
        const baseStyle: React.CSSProperties = {
            fontSize: '16px',
            fontFamily: '"Inter", system-ui, sans-serif',
            lineHeight: 1.6,
        }

        switch (type) {
            case 'fontSize':
                baseStyle.fontSize = FONT_SIZES[value as keyof typeof FONT_SIZES] || value
                break
            case 'fontFamily':
                baseStyle.fontFamily = FONT_FAMILIES[value as keyof typeof FONT_FAMILIES] || value
                break
            case 'lineHeight':
                baseStyle.lineHeight = value
                break
        }

        return baseStyle
    }

    return (
        <div className="mt-3 rounded-md overflow-hidden border border-border">
            <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span>Preview</span>
                <span className="font-medium">{value}</span>
            </div>
            <div className="bg-background-secondary p-4 text-foreground overflow-auto">
                <p style={getStyle()} className="whitespace-pre-wrap">
                    {SAMPLE_TEXT}
                </p>
            </div>
        </div>
    )
}
