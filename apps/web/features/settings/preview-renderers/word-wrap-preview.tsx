'use client'

import type { PreviewProps } from "../types";
import React from "react";

const SAMPLE_TEXT = `This is a long line of text that demonstrates how word wrapping works in the editor. When enabled, text will automatically wrap to the next line instead of extending beyond the visible area.`

export default function WordWrapPreview({ value }: PreviewProps<boolean>) {
	const isWrapped = value === true

	return (
		<div className='mt-3 rounded-md overflow-hidden border border-border'>
			<div className='text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between'>
				<span>Preview</span>
				<span className='font-medium'>{isWrapped ? 'Wrapped' : 'No Wrap'}</span>
			</div>
			<div
				className='bg-background-secondary p-3 text-sm font-mono text-foreground'
				style={{
					height: '80px',
					overflow: isWrapped ? 'hidden' : 'auto'
				}}
			>
				<p
					style={{
						whiteSpace: isWrapped ? 'normal' : 'nowrap',
						wordBreak: isWrapped ? 'break-word' : 'normal'
					}}
				>
					{SAMPLE_TEXT}
				</p>
			</div>
		</div>
	)
}
