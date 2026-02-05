'use client'

import { Zap } from 'lucide-react'
import type { CardData } from '../types/integrations'
import { getChipIcon } from '../utilities/icons'

const cards: CardData[] = [
	{
		title: 'Writing Workflow',
		count: 6,
		description:
			'Draft, refine, and structure long form writing with Markdown, slash commands, and fast navigation.',
		chips: [
			{ label: 'Markdown', icon: 'Markdown' },
			{ label: 'Slash Commands', icon: 'Slash Commands' },
			{ label: 'Templates', icon: 'Templates' },
			{ label: 'Backlinks', icon: 'Backlinks' },
			{ label: 'Global Search', icon: 'Global Search' },
			{ label: 'Keyboard Shortcuts', icon: 'Keyboard Shortcuts' }
		]
	},
	{
		title: 'Export & Share',
		count: 3,
		description: 'Move drafts wherever you publish or collaborate, without losing formatting.',
		chips: [
			{ label: 'PDF Export', icon: 'PDF Export' },
			{ label: 'Markdown Export', icon: 'Markdown Export' },
			{ label: 'Copy to Clipboard', icon: 'Copy to Clipboard' }
		]
	},
	{
		title: 'Media & References',
		count: 5,
		description: 'Keep context close by attaching or referencing supporting material.',
		chips: [
			{ label: 'Images', icon: 'Images' },
			{ label: 'Files', icon: 'Files' },
			{ label: 'Links', icon: 'Links' },
			{ label: 'Code Blocks', icon: 'Code Blocks' },
			{ label: 'Tables', icon: 'Tables' }
		]
	},
	{
		title: 'Privacy & Storage',
		count: 3,
		description: 'Your notes stay fast, local, and under your control.',
		chips: [
			{ label: 'Local First', icon: 'Local First' },
			{ label: 'Offline Mode', icon: 'Offline Mode' },
			{ label: 'Encrypted Vault', icon: 'Encrypted Vault' }
		]
	}
]

function Chip({ label, icon }: { label: string; icon: string }) {
	const Icon = getChipIcon(icon)
	return (
		<span className='flex items-center gap-3 rounded-2xl bg-gradient-to-b from-neutral-800 to-neutral-900 px-4 py-2.5 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(0,0,0,0.04)]'>
			<Icon className='size-4 shrink-0 text-neutral-500' aria-hidden='true' />
			<span className='text-sm font-medium text-white whitespace-nowrap'>{label}</span>
		</span>
	)
}

function Card({ data }: { data: CardData }) {
	return (
		<article className='relative flex flex-col gap-6 rounded-[20px] bg-neutral-950 p-6'>
			<div className='flex flex-col gap-3 pr-8'>
				<h3 className='text-lg font-semibold text-white'>{data.title}</h3>
				<p className='text-[13px] leading-5 text-neutral-400'>{data.description}</p>
			</div>
			<span
				className='absolute top-6 right-6 text-sm font-medium text-neutral-500'
				aria-label={`${data.count} features`}
			>
				{data.count}
			</span>
			<div className='h-px w-full bg-neutral-800' role='separator' />
			<div className='flex flex-wrap gap-3'>
				{data.chips.map(function renderChip(chip) {
					return <Chip key={chip.label} label={chip.label} icon={chip.icon} />
				})}
			</div>
		</article>
	)
}

function GlowPanel() {
	return (
		<div className='relative flex h-full min-h-[400px] items-center justify-center overflow-hidden rounded-[20px] bg-neutral-950'>
			<div className='absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06)_0%,transparent_70%)]' />
			<div className='absolute bottom-0 left-1/2 h-1/2 w-3/4 -translate-x-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(245,158,11,0.15)_0%,transparent_70%)]' />
			<div
				className='absolute inset-0 opacity-20'
				style={{
					backgroundImage:
						'repeating-conic-gradient(from 0deg at 50% 100%, transparent 0deg, rgba(255,255,255,0.03) 1deg, transparent 2deg)'
				}}
			/>
			<div className='relative z-10 flex size-16 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/80 shadow-lg backdrop-blur-sm'>
				<Zap className='size-7 text-neutral-300' aria-hidden='true' />
			</div>
		</div>
	)
}

function SubtitlePill() {
	return (
		<div className='flex items-center justify-center gap-2'>
			<span className='inline-flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1'>
				<Zap className='size-4 text-neutral-400' aria-hidden='true' />
				<span className='text-sm font-medium text-white'>17</span>
			</span>
			<span className='text-sm text-neutral-400'>
				workflows and adding more{' '}
				<span className='font-medium text-white'>every month</span>
			</span>
		</div>
	)
}

export default function Integrations() {
	return (
		<section
			className='mx-auto w-full max-w-6xl px-4 py-24'
			aria-labelledby='integrations-heading'
		>
			<div className='mb-10 flex flex-col items-center gap-5'>
				<h2
					id='integrations-heading'
					className='text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl'
				>
					Integrations
				</h2>
				<SubtitlePill />
			</div>
			<div className='grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.2fr_1fr]'>
				<div className='flex flex-col gap-3'>
					<Card data={cards[0]} />
					<Card data={cards[1]} />
				</div>
				<GlowPanel />
				<div className='flex flex-col gap-3'>
					<Card data={cards[2]} />
					<Card data={cards[3]} />
				</div>
			</div>
		</section>
	)
}
