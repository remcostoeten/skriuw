import React from 'react'
import { cn } from '@/shared/utilities'
import type { UserSetting } from '@/shared/data/types'

interface SettingExampleProps {
	setting: UserSetting
	value: any
	className?: string
	children?: React.ReactNode
}

/**
 * Reusable component for displaying live examples/previews of settings
 * Can be used to show how a setting affects the UI in real-time
 */
export function SettingExample({
	setting,
	value,
	className,
	children
}: SettingExampleProps) {
	return (
		<div
			className={cn(
				'mt-4 p-4 border border-border rounded-md bg-muted/30',
				className
			)}
		>
			<div className="mb-2">
				<h4 className="text-sm font-medium text-foreground">Preview</h4>
				<p className="text-xs text-muted-foreground">
					See how this setting affects the editor
				</p>
			</div>
			{children}
		</div>
	)
}

/**
 * Word Wrap Example - Shows how word wrap affects text rendering
 */
export function WordWrapExample({ value }: { value: boolean }) {
	return (
		<SettingExample setting={{ key: 'wordWrap' } as UserSetting} value={value}>
			<div
				style={{
					whiteSpace: value ? 'pre-wrap' : 'pre',
					wordWrap: value ? 'break-word' : 'normal',
					overflowX: value ? 'hidden' : 'auto'
				}}
				className="font-mono text-sm p-3 bg-background border rounded max-w-full"
			>
				{`This is a very long line of text that will demonstrate the word wrapping functionality. When word wrap is enabled, this text should wrap to fit within the container width. When disabled, it should create a horizontal scrollbar and stay on one line.`}
			</div>
			<p className="text-xs text-muted-foreground mt-2">
				{value
					? '✓ Text wraps to fit the container width'
					: '⚠ Text stays on one line with horizontal scroll'}
			</p>
		</SettingExample>
	)
}

