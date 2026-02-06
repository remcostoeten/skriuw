import type { LucideIcon } from 'lucide-react'

export type ChipData = {
	label: string
	icon: string
}

export type CardData = {
	title: string
	count: number
	description: string
	chips: ChipData[]
}

export type IconMap = Record<string, LucideIcon>
