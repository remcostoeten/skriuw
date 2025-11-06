import type { ReactNode } from 'react'

declare global {
	/**
	 * Global type representing React component children props.
	 * This type can be used without explicit imports throughout the application.
	 *
	 * @example
	 * ```tsx
	 * type ComponentProps = {
	 *   children: ChildrenProp
	 * }
	 * ```
	 *
	 * @example
	 * ```tsx
	 * const MyComponent = ({ children }: { children: ChildrenProp }) => {
	 *   return <div>{children}</div>
	 * }
	 * ```
	 */
	type ChildrenProp = ReactNode
}

export {}
