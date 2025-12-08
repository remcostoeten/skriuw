'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export { type ReactNode, useEffect, useState } from 'react'

type Props = {
	children: ReactNode
	container?: HTMLElement
}

export function Portal({ children, container }: Props) {
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
		return () => setMounted(false)
	}, [])

	if (!mounted) return null

	return createPortal(children, container || document.body)
}
