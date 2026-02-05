'use client'

import { AssetLibrary } from './AssetLibrary'

type MediaPickerProps = {
    onSelect: (url: string) => void
    className?: string
}

export function MediaPicker({ onSelect, className }: MediaPickerProps) {
    return (
        <AssetLibrary
            onSelect={onSelect}
            className={className}
        />
    )
}
