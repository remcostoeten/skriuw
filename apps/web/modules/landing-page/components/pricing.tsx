'use client'

import NumberFlow from '@number-flow/react'
import { Check } from 'lucide-react'
import { useBilling } from '../hooks/use-billing'
import { plans } from '../types/pricing'
import type { TBilling, TPlan } from '../types/pricing'

function Toggle({ billing, onToggle }: { billing: TBilling; onToggle: () => void }) {
	return (
		<button
			type='button'
			role='switch'
			aria-checked={billing === 'yearly'}
			aria-label='Billing period'
			onClick={onToggle}
			onKeyDown={function handleKey(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					onToggle()
				}
			}}
			className='group flex items-center gap-2 focus-visible:outline-none'
		>
			<span className='relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-neutral-800 transition-colors'>
				<span
					className={`inline-block size-3.5 rounded-full bg-neutral-400 transition-transform ${
						billing === 'yearly' ? 'translate-x-[18px]' : 'translate-x-[3px]'
					}`}
				/>
			</span>
			<span className='text-sm text-neutral-400 group-focus-visible:ring-2 group-focus-visible:ring-amber-500 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-neutral-950 rounded'>
				Billed {billing}
			</span>
		</button>
	)
}

function PriceDisplay({ plan, billing }: { plan: TPlan; billing: TBilling }) {
	if (plan.id === 'starter') {
		return (
			<div className='flex items-baseline gap-1'>
				<span className='text-5xl font-bold tracking-tight text-white'>Free</span>
			</div>
		)
	}

	if (plan.id === 'supporter') {
		return (
			<div className='flex flex-col'>
				<span className='text-4xl font-bold leading-tight tracking-tight text-white'>
					€ An amount
				</span>
				<span className='text-4xl font-bold leading-tight tracking-tight text-white'>
					you wish,-
				</span>
			</div>
		)
	}

	const value = billing === 'yearly' ? plan.yearly : plan.monthly

	return (
		<div className='flex items-baseline gap-2'>
			<span className='text-sm font-medium text-neutral-300'>€</span>
			<NumberFlow
				value={value ?? 0}
				format={{
					minimumFractionDigits: plan.id === 'premium' ? 2 : 0,
					maximumFractionDigits: plan.id === 'premium' ? 2 : 0
				}}
				className='text-5xl font-bold tracking-tight text-white'
			/>
			<span className='text-sm text-neutral-400'>{plan.unit}</span>
		</div>
	)
}

function PlanCard({
	plan,
	billing,
	onToggle
}: {
	plan: TPlan
	billing: TBilling
	onToggle: () => void
}) {
	const showToggle = plan.id !== 'starter' && plan.id !== 'supporter'

	return (
		<article
			className={`relative flex flex-col rounded-[20px] bg-neutral-950 p-6 ${
				plan.tone === 'hot' ? 'border border-amber-500/20' : 'border border-neutral-800/50'
			}`}
		>
			<div className='flex items-start justify-between'>
				<h3 className='text-base font-medium text-white'>{plan.title}</h3>
				{plan.badge && (
					<span className='rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-black'>
						{plan.badge}
					</span>
				)}
			</div>

			<div className='mt-6'>
				<PriceDisplay plan={plan} billing={billing} />
			</div>

			{showToggle && (
				<div className='mt-3'>
					<Toggle billing={billing} onToggle={onToggle} />
				</div>
			)}

			<ul className='mt-8 flex flex-col gap-3' aria-label={`${plan.title} features`}>
				{plan.items.map(function renderItem(item) {
					return (
						<li key={item} className='flex items-start gap-2.5'>
							<Check
								className='mt-0.5 size-4 shrink-0 text-amber-500'
								aria-hidden='true'
							/>
							<span className='text-sm text-neutral-300'>{item}</span>
						</li>
					)
				})}
			</ul>

			<div className='mt-auto pt-8'>
				<button
					type='button'
					className={`w-full rounded-xl px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
						plan.tone === 'hot'
							? 'bg-amber-500 text-black hover:bg-amber-400'
							: 'bg-neutral-900 text-neutral-200 border border-neutral-800 hover:bg-neutral-800'
					}`}
				>
					{plan.cta}
				</button>
			</div>
		</article>
	)
}

export default function Pricing() {
	const { billing, toggle } = useBilling()

	return (
		<section className='mx-auto w-full max-w-6xl px-4 py-24' aria-labelledby='pricing-heading'>
			<div className='mb-12 flex flex-col items-center gap-4'>
				<h2
					id='pricing-heading'
					className='text-center text-4xl font-semibold tracking-tight text-white sm:text-5xl'
				>
					Pricing
				</h2>
				<p className='max-w-lg text-center text-base text-neutral-400'>
					Choose the plan that matches your workflow — no hidden fees, no surprises.
				</p>
			</div>
			<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
				{plans.map(function renderPlan(plan) {
					return (
						<PlanCard key={plan.id} plan={plan} billing={billing} onToggle={toggle} />
					)
				})}
			</div>
		</section>
	)
}
