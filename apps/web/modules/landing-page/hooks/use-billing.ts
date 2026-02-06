'use client'

import { useState, useCallback } from 'react'
import type { TBilling } from '../types/pricing'

export function useBilling() {
	const [billing, setBilling] = useState<TBilling>('yearly')

	const toggle = useCallback(function toggleBilling() {
		setBilling(function flip(prev) {
			return prev === 'yearly' ? 'monthly' : 'yearly'
		})
	}, [])

	return { billing, toggle } as const
}
