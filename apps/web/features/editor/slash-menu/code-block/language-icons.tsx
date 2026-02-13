'use client'

/**
 * Language Icons for Code Block
 * Simple text-based language indicators with fallback to Lucide icons
 */

import { FileCode, FileJson, FileText, Terminal, Database, Braces, Hash } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@skriuw/shared'

type LanguageIconConfig = {
	icon: LucideIcon
	className?: string
}

const LANGUAGE_ICONS: Record<string, LanguageIconConfig> = {
	typescript: { icon: FileCode, className: 'text-blue-400' },
	javascript: { icon: FileCode, className: 'text-yellow-400' },
	tsx: { icon: FileCode, className: 'text-blue-400' },
	jsx: { icon: FileCode, className: 'text-yellow-400' },
	python: { icon: FileCode, className: 'text-green-400' },
	css: { icon: Braces, className: 'text-sky-400' },
	html: { icon: FileCode, className: 'text-orange-500' },
	json: { icon: FileJson, className: 'text-yellow-600' },
	bash: { icon: Terminal, className: 'text-green-500' },
	sql: { icon: Database, className: 'text-blue-500' },
	yaml: { icon: FileText, className: 'text-red-400' },
	markdown: { icon: Hash, className: 'text-gray-400' },
	rust: { icon: FileCode, className: 'text-orange-600' },
	go: { icon: FileCode, className: 'text-cyan-400' },
	java: { icon: FileCode, className: 'text-red-500' },
	csharp: { icon: FileCode, className: 'text-purple-500' },
	cpp: { icon: FileCode, className: 'text-blue-600' },
	php: { icon: FileCode, className: 'text-indigo-400' },
	ruby: { icon: FileCode, className: 'text-red-600' },
	swift: { icon: FileCode, className: 'text-orange-500' },
	kotlin: { icon: FileCode, className: 'text-purple-400' },
	scala: { icon: FileCode, className: 'text-red-400' },
	graphql: { icon: Braces, className: 'text-pink-500' },
	dockerfile: { icon: FileText, className: 'text-blue-400' },
	plaintext: { icon: FileText, className: 'text-gray-500' }
}

const DEFAULT_ICON: LanguageIconConfig = { icon: FileCode, className: 'text-muted-foreground' }

/**
 * Get the icon component for a language
 */
export function getLanguageIcon(language: string): LucideIcon {
	return LANGUAGE_ICONS[language]?.icon || DEFAULT_ICON.icon
}

/**
 * Get the icon class for a language
 */
export function getLanguageIconClass(language: string): string {
	return LANGUAGE_ICONS[language]?.className || DEFAULT_ICON.className || ''
}

type LanguageIconProps = {
	language: string
	size?: number
	className?: string
}

/**
 * Language icon component with proper styling
 */
export function LanguageIcon({ language, size = 16, className = '' }: LanguageIconProps) {
	const IconComponent = getLanguageIcon(language)
	const iconClass = getLanguageIconClass(language)

	return <IconComponent size={size} className={cn('flex-shrink-0', iconClass, className)} />
}
