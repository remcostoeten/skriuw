import type { ReactNode } from 'react'

declare global {
	/**
	 * Global type representing React component children props.
	 * This type can be used without explicit imports throughout the application.
	 *
	 * @example
	 * ```tsx
	 * type ComponentProps = {
	 *   children: PageProps
	 * }
	 * ```
	 *
	 * @example
	 * ```tsx
	 * const MyComponent = ({ children }: { children: PageProps }) => {
	 *   return <div>{children}</div>
	 * }
	 * ```
	 */
	type PageProps = ReactNode
}

export {}