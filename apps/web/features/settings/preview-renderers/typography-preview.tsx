'use client'

import type { PreviewProps } from "../types";
import React from "react";

const SAMPLE_TEXT = `The quick brown fox jumps over the lazy dog.
1234567890
!@#$%^&*()_+`

type TypographyType = 'fontSize' | 'fontFamily' | 'lineHeight'

type TypographyPreviewProps = {
	type: TypographyType
} & PreviewProps

const FONT_SIZES = {
	small: '12px',
	medium: '16px',
	large: '20px',
	'x-large': '24px'
}

const FONT_FAMILIES = {
	inter: '"Inter", system-ui, sans-serif',
	mono: '"Fira Code", monospace',
	serif: 'Georgia, serif',
	'sans-serif': 'system-ui, sans-serif'
}

export default function TypographyPreview({ value, type, allSettings }: TypographyPreviewProps) {
	const getStyle = () => {
		// Default values
		let fontSize = 'medium'
		let fontFamily = 'inter'
		let lineHeight = 1.6

		// Override with allSettings if available
		if (allSettings) {
			if (allSettings.fontSize) fontSize = allSettings.fontSize
			if (allSettings.fontFamily) fontFamily = allSettings.fontFamily
			if (allSettings.lineHeight) lineHeight = allSettings.lineHeight
		}

		// Override with current value being edited
		if (type === 'fontSize') fontSize = value
		if (type === 'fontFamily') fontFamily = value
		if (type === 'lineHeight') lineHeight = value

		return {
			fontSize: FONT_SIZES[fontSize as keyof typeof FONT_SIZES] || fontSize,
			fontFamily: FONT_FAMILIES[fontFamily as keyof typeof FONT_FAMILIES] || fontFamily,
			lineHeight: lineHeight
		}
	}

	return (
		<div className='mt-3 rounded-md overflow-hidden border border-border'>
			<div className='text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between'>
				<span>Preview</span>
				<span className='font-medium'>{value}</span>
			</div>
			<div className='bg-background-secondary p-4 text-foreground overflow-auto'>
				<p style={getStyle()} className='whitespace-pre-wrap'>
					{SAMPLE_TEXT}
				</p>
			</div>
		</div>
	)
}
