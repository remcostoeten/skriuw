'use client'

/**
 * Language Selector Dropdown
 * Accessible dropdown for selecting code block language
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@skriuw/shared'
import { LANGUAGES, type TLanguage } from './types'
import { LanguageIcon } from './language-icons'

type LanguageSelectorProps = {
    value: string
    onChange: (language: string) => void
    className?: string
    disabled?: boolean
}

export function LanguageSelector({ value, onChange, className, disabled }: LanguageSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLUListElement>(null)

    const currentLabel = LANGUAGES.find((l) => l.value === value)?.label || value

    const filteredLanguages = LANGUAGES.filter(
        (lang) =>
            lang.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lang.value.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setSearchQuery('')
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const highlighted = listRef.current.children[highlightedIndex] as HTMLElement
            if (highlighted) {
                highlighted.scrollIntoView({ block: 'nearest' })
            }
        }
    }, [highlightedIndex, isOpen])

    // Reset highlighted index when filter changes
    useEffect(() => {
        setHighlightedIndex(0)
    }, [searchQuery])

    const handleSelect = useCallback(
        (language: string) => {
            onChange(language)
            setIsOpen(false)
            setSearchQuery('')
        },
        [onChange]
    )

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!isOpen) {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                    e.preventDefault()
                    setIsOpen(true)
                }
                return
            }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setHighlightedIndex((i) => Math.min(i + 1, filteredLanguages.length - 1))
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setHighlightedIndex((i) => Math.max(i - 1, 0))
                    break
                case 'Enter':
                    e.preventDefault()
                    if (filteredLanguages[highlightedIndex]) {
                        handleSelect(filteredLanguages[highlightedIndex].value)
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    setIsOpen(false)
                    setSearchQuery('')
                    break
                case 'Tab':
                    // Allow tab to close and move focus
                    setIsOpen(false)
                    setSearchQuery('')
                    break
            }
        },
        [isOpen, filteredLanguages, highlightedIndex, handleSelect]
    )

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={cn(
                    'flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors',
                    'bg-muted/50 hover:bg-muted border border-border/50 hover:border-border',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                    disabled && 'opacity-50 cursor-not-allowed'
                )}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`Language: ${currentLabel}`}
            >
                <LanguageIcon language={value} size={14} />
                <span className="text-foreground">{currentLabel}</span>
                <ChevronDown
                    className={cn(
                        'w-3 h-3 text-muted-foreground transition-transform',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    className={cn(
                        'absolute z-50 top-full left-0 mt-1 w-48',
                        'bg-popover border border-border rounded-md shadow-lg',
                        'animate-in fade-in-0 zoom-in-95'
                    )}
                >
                    {/* Search Input */}
                    <div className="p-1.5 border-b border-border">
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search languages..."
                            className={cn(
                                'w-full px-2 py-1 text-xs bg-transparent',
                                'border-none focus:outline-none focus:ring-0',
                                'placeholder:text-muted-foreground'
                            )}
                            aria-label="Search languages"
                        />
                    </div>

                    {/* Options List */}
                    <ul
                        ref={listRef}
                        className="max-h-48 overflow-y-auto p-1"
                        role="listbox"
                        aria-label="Language options"
                    >
                        {filteredLanguages.length === 0 ? (
                            <li className="px-2 py-1.5 text-xs text-muted-foreground">
                                No languages found
                            </li>
                        ) : (
                            filteredLanguages.map((lang, index) => (
                                <li
                                    key={lang.value}
                                    role="option"
                                    aria-selected={lang.value === value}
                                    onClick={() => handleSelect(lang.value)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    className={cn(
                                        'flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-pointer',
                                        'transition-colors',
                                        index === highlightedIndex && 'bg-muted',
                                        lang.value === value && 'text-primary'
                                    )}
                                >
                                    <LanguageIcon language={lang.value} size={14} />
                                    <span className="flex-1">{lang.label}</span>
                                    {lang.value === value && (
                                        <Check className="w-3 h-3 text-primary" />
                                    )}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}
