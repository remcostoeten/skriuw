import { Pencil, Hand, Keyboard } from 'lucide-react'
import { useState } from 'react'

import {
    Dialog,
    DialogContent,
    DialogAside,
    DialogContentArea,
    DialogNavGroup,
    DialogSection,
    DialogSeparator,
    DialogClose,
    DialogHeader,
    DialogTitle
} from '@/shared/ui/dialog-drawer'

import { useSettings, SettingsGroup } from '@/features/settings'
import { EDITOR_SETTINGS_GROUPS } from '@/features/settings/editor-settings'
import { ShortcutsReference } from '@/features/shortcuts/components'

type props = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function SidebarMenu({ open, onOpenChange }: props) {
    const [activeItem, setActiveItem] = useState<string>('editor')
    const { settings, updateMultipleSettings } = useSettings()

    const appItems = [
        {
            id: 'editor',
            label: 'Editor',
            icon: <Pencil className="w-4 h-4" />,
            active: activeItem === 'editor',
            onClick: () => setActiveItem('editor')
        },
        {
            id: 'shortcuts',
            label: 'Shortcuts',
            icon: <Keyboard className="w-4 h-4" />,
            active: activeItem === 'shortcuts',
            onClick: () => setActiveItem('shortcuts')
        }
    ]

    const syncItems = [
        {
            id: 'Skriuw',
            label: 'Skriuw Sync',
            icon: <Hand className="w-4 h-4" />,
            active: activeItem === 'Skriuw',
            onClick: () => setActiveItem('Skriuw')
        }
    ]

    const handleSettingChange = (key: string, value: unknown) => {
        updateMultipleSettings({ [key]: value })
    }

    const renderSettingsContent = () => {
        const settingsGroup = EDITOR_SETTINGS_GROUPS.find(
            (group) => group.category === activeItem
        )

        if (settingsGroup) {
            return (
                <SettingsGroup
                    group={settingsGroup}
                    values={settings}
                    onChange={handleSettingChange}
                />
            )
        }

        // Placeholder content for non-settings sections
        switch (activeItem) {
            case 'shortcuts':
                return <ShortcutsReference />
            case 'Skriuw':
                return (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-foreground">
                            Skriuw synchronization
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Configure Skriuw feedback synchronization settings.
                        </p>
                    </div>
                )
            default:
                return null
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex flex-col p-0 overflow-hidden border border-border/50">
                <DialogClose aria-label="Close settings" />
                <div className="flex flex-row flex-1 min-h-0">
                    <DialogAside className="min-w-[200px] max-w-[200px] border-r border-border p-6 overflow-y-auto h-full">
                        <DialogHeader className="w-full pb-4">
                            <DialogTitle>Settings</DialogTitle>
                        </DialogHeader>
                        <DialogSection label="App">
                            <DialogNavGroup items={appItems} />
                        </DialogSection>

                        <DialogSeparator />

                        <DialogSection label="Synchronization">
                            <DialogNavGroup items={syncItems} />
                        </DialogSection>
                    </DialogAside>

                    <DialogContentArea className="flex-1 min-w-0 p-6 overflow-y-auto h-full">
                        {renderSettingsContent()}
                    </DialogContentArea>
                </div>
            </DialogContent>
        </Dialog>
    )
}
