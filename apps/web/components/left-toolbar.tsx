'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import {
	NotesIcon,
	CalendarIcon,
	TodoIcon,
	GearIcon,
	FolderIcon,
	UIPlaygroundIcon,
	IconButton,
} from '@skriuw/ui/icons'

import { Logo } from './logo'

type LeftToolbarProps = {
	onSettingsClick?: () => void
}

const handleNonExistentRoute = (target: string) => {
	if (typeof window !== 'undefined') {
		console.info(`Route "${target}" is not available yet.`)
	}
}

export function LeftToolbar({ onSettingsClick }: LeftToolbarProps) {
	const [activeItem, setActiveItem] = useState<string | null>(null)
	const router = useRouter()
	const pathname = usePathname()

	const isOnNoteView = pathname === '/' || pathname.startsWith('/note/')
	const isOnArchive = pathname === '/archive'
	const isOnTrash = pathname === '/trash'

	const navigate = (href: string) => {
		if (pathname !== href) {
			router.push(href)
		}
	}

	return (
		<div className="w-12 h-full bg-sidebar-background border-r border-sidebar-border flex flex-col justify-between items-center px-1.5">
			<div className="flex flex-col items-center gap-2 pt-1.5">
				<div className="h-7 w-7 flex items-center justify-center">
					<Logo />
				</div>
				<IconButton
					icon={<NotesIcon />}
					tooltip="Notes"
					active={isOnNoteView}
					variant="sidebar"
					onClick={() => navigate('/')}
				/>
				<IconButton
					icon={<FolderIcon closedVariant />}
					hoverIcon={<FolderIcon />}
					tooltip="Data & Backup"
					active={isOnArchive}
					variant="sidebar"
					onClick={() => navigate('/archive')}
				/>
				<IconButton
					icon={<CalendarIcon />}
					tooltip="Calendar"
					active={false}
					variant="sidebar"
					onClick={() => handleNonExistentRoute('calendar')}
				/>
				<IconButton
					icon={<TodoIcon />}
					tooltip="Checklist"
					active={false}
					variant="sidebar"
					onClick={() => handleNonExistentRoute('checklist')}
				/>
			</div>

			<div className="flex flex-col items-center gap-2 pb-12">
				<IconButton
					icon={<Trash2 className="w-4 h-4" />}
					tooltip="Trash"
					active={isOnTrash}
					variant="sidebar"
					onClick={() => navigate('/trash')}
				/>
				<IconButton
					icon={<GearIcon />}
					tooltip="Settings"
					active={activeItem === 'settings'}
					variant="sidebar"
					onClick={() => {
						setActiveItem(activeItem === 'settings' ? null : 'settings')
						onSettingsClick?.()
					}}
				/>
			</div>
		</div>
	)
}

