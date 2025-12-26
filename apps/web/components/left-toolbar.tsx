'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import {
	NotesIcon,
	GearIcon,
	FolderIcon,
	IconButton,
} from '@skriuw/ui/icons'

import { Logo } from './logo'

type LeftToolbarProps = {
	onSettingsClick?: () => void
}

export function LeftToolbar({ onSettingsClick }: LeftToolbarProps) {
	const [activeItem, setActiveItem] = useState<string | null>(null)
	const router = useRouter()
	const pathname = usePathname()

	const isOnNoteView = pathname === '/' || pathname.startsWith('/note/')
	const isOnArchive = pathname === '/archive'
	const isOnTrash = pathname === '/trash'

	function navigate(href: string) {
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
					icon={isOnArchive ? <FolderIcon /> : <FolderIcon closedVariant />}
					hoverIcon={<FolderIcon />}
					tooltip="Data & Backup"
					active={isOnArchive}
					variant="sidebar"
					onClick={() => navigate('/archive')}
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

