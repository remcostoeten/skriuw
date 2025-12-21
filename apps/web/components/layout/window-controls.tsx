import { Minimize2, Maximize2, X, Square } from 'lucide-react'
import { useEffect, useState } from 'react'

import { isTauriAvailable, cn } from '@skriuw/shared'

export function WindowControls() {
	const [isMaximized, setIsMaximized] = useState(false)

	useEffect(() => {
		if (!isTauriAvailable()) return

		let cleanup: (() => void)[] = []

		const setup = async () => {
			try {
				const { getCurrentWindow } = await import('@tauri-apps/api/window')
				const appWindow = getCurrentWindow()

				const maximized = await appWindow.isMaximized()
				setIsMaximized(maximized)

				const { listen } = await import('@tauri-apps/api/event')
				const unlistenMaximized = await listen('tauri://resize', () => {
					appWindow.isMaximized().then(setIsMaximized)
				})

				cleanup.push(unlistenMaximized)
			} catch (error) {
				console.error('Failed to setup window state listeners:', error)
			}
		}

		setup()

		return () => {
			cleanup.forEach((fn) => fn())
		}
	}, [])

	if (!isTauriAvailable()) {
		return null
	}

	const handleMinimize = async () => {
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window')
			const appWindow = getCurrentWindow()
			await appWindow.minimize()
		} catch (error) {
			console.error('Failed to minimize window:', error)
		}
	}

	const handleMaximize = async () => {
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window')
			const appWindow = getCurrentWindow()
			if (isMaximized) {
				await appWindow.unmaximize()
			} else {
				await appWindow.maximize()
			}
		} catch (error) {
			console.error('Failed to toggle maximize:', error)
		}
	}

	const handleClose = async () => {
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window')
			const appWindow = getCurrentWindow()
			await appWindow.close()
		} catch (error) {
			console.error('Failed to close window:', error)
		}
	}

	return (
		<div className="flex items-center h-full" data-tauri-drag-region="false">
			<button
				type="button"
				onClick={handleMinimize}
				className={cn(
					'h-full px-3 flex items-center justify-center',
					'text-muted-foreground hover:text-foreground',
					'hover:bg-muted/60 active:bg-muted/80',
					'transition-colors duration-150',
					'group cursor-pointer'
				)}
				aria-label="Minimize"
				data-tauri-drag-region="false"
			>
				<Minimize2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
			</button>

			<button
				type="button"
				onClick={handleMaximize}
				className={cn(
					'h-full px-3 flex items-center justify-center',
					'text-muted-foreground hover:text-foreground',
					'hover:bg-muted/60 active:bg-muted/80',
					'transition-colors duration-150',
					'group cursor-pointer'
				)}
				aria-label={isMaximized ? 'Restore' : 'Maximize'}
				data-tauri-drag-region="false"
			>
				{isMaximized ? (
					<Square
						className="w-3 h-3 group-hover:scale-110 transition-transform"
						strokeWidth={2.5}
					/>
				) : (
					<Maximize2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
				)}
			</button>

			<button
				type="button"
				onClick={handleClose}
				className={cn(
					'h-full px-3 flex items-center justify-center',
					'text-muted-foreground hover:text-foreground',
					'hover:bg-destructive hover:text-destructive-foreground',
					'active:bg-destructive/90',
					'transition-colors duration-150',
					'group cursor-pointer'
				)}
				aria-label="Close"
				data-tauri-drag-region="false"
			>
				<X className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
			</button>
		</div>
	)
}
