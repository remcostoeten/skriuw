'use client'

import React from 'react'

// Props passed to all preview components
import type { PreviewProps } from '../types'


// Lazy load heavy components
const EditorThemePreview = React.lazy(() => import('./editor-theme-preview'))

// Import lightweight components directly
import WordWrapPreview from './word-wrap-preview'
import TypographyPreview from './typography-preview'
import LayoutPreview from './layout-preview'
import SearchPreview from './search-preview'
import BlockNotePreview from './blocknote-preview'
import MultiTabPreview from './multi-tab-preview'

// Registry of all preview renderers
export const PREVIEW_RENDERERS: Record<string, React.ComponentType<PreviewProps | any>> = {
    'editor-theme': EditorThemePreview,
    'word-wrap': WordWrapPreview,
    'typography': TypographyPreview,
    'layout': LayoutPreview,
    'search': SearchPreview,
    'blocknote': BlockNotePreview,
    'multi-tab': MultiTabPreview,
}

// Helper to check if a preview exists for a component key
export function hasPreviewRenderer(componentKey: string): boolean {
    return componentKey in PREVIEW_RENDERERS
}

// Get preview renderer component
export function getPreviewRenderer(componentKey: string) {
    return PREVIEW_RENDERERS[componentKey] || null
}
