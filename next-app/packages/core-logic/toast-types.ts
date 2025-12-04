import * as React from 'react'

export type ToastActionElement = React.ReactElement<{
	altText: string
}>

export interface ToastProps {
	variant?: 'default' | 'destructive'
	title?: React.ReactNode
	description?: React.ReactNode
	action?: ToastActionElement
	onOpenChange?: (open: boolean) => void
}
