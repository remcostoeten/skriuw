/**
 * Editor Design Tokens
 * Centralized constants for typography, spacing, and layout configurations.
 * These work alongside CSS variables defined in globals.css for theme-aware colors.
 */

// Font Size Mappings
export const FONT_SIZES = {
    small: '14px',
    medium: '16px',
    large: '18px',
    'x-large': '20px',
} as const

// Font Family Mappings
export const FONT_FAMILIES = {
    inter: '"Inter", system-ui, sans-serif',
    mono: '"Fira Code", "Menlo", "Monaco", monospace',
    serif: '"Georgia", "Times New Roman", serif',
    'sans-serif': 'system-ui, sans-serif',
} as const

// Max Width Mappings for editor content
export const MAX_WIDTHS = {
    narrow: '65ch',
    medium: '75ch',
    wide: '85ch',
    full: 'none',
} as const

// Line Height Options
export const LINE_HEIGHTS = {
    compact: 1.4,
    normal: 1.6,
    relaxed: 1.8,
} as const

// Editor Layout Constants
export const EDITOR_LAYOUT = {
    centeredMaxWidth: '655px',
    viewerMaxWidth: '719px',
    viewerContentMaxWidth: '587px',
    padding: {
        horizontal: '2.5rem',
        vertical: '1.5rem',
    },
} as const

// Responsive Breakpoints (aligns with Tailwind)
export const BREAKPOINTS = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
} as const

/**
 * Helper functions for converting settings to CSS values
 */
export function getFontSizePx(size: string): string {
    return FONT_SIZES[size as keyof typeof FONT_SIZES] ?? FONT_SIZES.medium
}

export function getFontFamily(family: string): string {
    return FONT_FAMILIES[family as keyof typeof FONT_FAMILIES] ?? FONT_FAMILIES.inter
}

export function getMaxWidthPx(width: string): string {
    return MAX_WIDTHS[width as keyof typeof MAX_WIDTHS] ?? MAX_WIDTHS.full
}

export type FontSize = keyof typeof FONT_SIZES
export type FontFamily = keyof typeof FONT_FAMILIES
export type MaxWidth = keyof typeof MAX_WIDTHS
