'use client'

import { Button } from '@skriuw/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@skriuw/ui/select'
import { motion } from 'framer-motion'
import { motionEase } from '../utilities/motion-config'

type Filters = {
	status: string
	category: string
	year: string
	sort: 'desc' | 'asc'
}

type Props = {
	statuses: string[]
	categories: string[]
	years: string[]
	filters: Filters
	onStatus: (value: string) => void
	onCategory: (value: string) => void
	onYear: (value: string) => void
	onSort: (value: 'desc' | 'asc') => void
	pending: boolean
}

export function FilterBar({ statuses, categories, years, filters, onStatus, onCategory, onYear, onSort, pending }: Props) {
	function renderStatus(value: string) {
		const active = filters.status === value
		return (
			<Button
				key={value}
				variant={active ? 'secondary' : 'ghost'}
				onClick={function handle() {
					onStatus(value)
				}}
				className="rounded-full px-4 capitalize"
				aria-pressed={active}
			>
				{value === 'all' ? 'All' : value.replace('-', ' ')}
			</Button>
		)
	}

	function renderSelect(label: string, value: string, options: string[], onChange: (value: string) => void, placeholder: string) {
		return (
			<div className="space-y-2">
				<span className="text-xs text-muted-foreground">{label}</span>
				<Select value={value} onValueChange={onChange}>
					<SelectTrigger className="w-40">
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						{options.map(function option(item) {
							return (
								<SelectItem key={item} value={item}>
									{item}
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>
		)
	}

	return (
		<motion.div
			className="w-full rounded-2xl border border-border/60 bg-gradient-to-br from-background/80 to-muted/30 p-4 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.7)]"
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ ease: motionEase, duration: 0.35 }}
			aria-busy={pending}
		>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-wrap gap-2" aria-label="Filter by status">
					{statuses.map(renderStatus)}
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					{renderSelect('Category', filters.category, categories, onCategory, 'Select category')}
					{renderSelect('Year', filters.year, years, onYear, 'Select year')}
					<div className="space-y-2">
						<span className="text-xs text-muted-foreground">Sort</span>
						<div className="flex items-center gap-2">
							<Button
								variant={filters.sort === 'desc' ? 'secondary' : 'ghost'}
								onClick={function handle() {
									onSort('desc')
								}}
								className="rounded-full"
							>
								Newest
							</Button>
							<Button
								variant={filters.sort === 'asc' ? 'secondary' : 'ghost'}
								onClick={function handle() {
									onSort('asc')
								}}
								className="rounded-full"
							>
								Oldest
							</Button>
						</div>
					</div>
				</div>
			</div>
		</motion.div>
	)
}
