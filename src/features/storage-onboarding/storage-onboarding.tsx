import { Cloud, Database, HardDrive } from "lucide-react"
import { useMemo, type JSX } from "react"

import type { StorageAdapterName, StorageConfig } from "@/api/storage/generic-types"

import { cn } from "@/shared/utilities/cn"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "ui"

type StorageOnboardingProps = {
        onSelect: (config: StorageConfig) => void
}

type StorageOption = {
        id: StorageAdapterName
        title: string
        description: string
        icon: JSX.Element
        badge?: string
}

const options: StorageOption[] = [
        {
                id: 'drizzleLibsql',
                title: 'Cloud sync (Turso/libsql)',
                description: 'Keep notes identical across web and desktop with a cloud replica.',
                icon: <Cloud className="h-5 w-5" />,
                badge: 'Sync'
        },
        {
                id: 'drizzleLocalSqlite',
                title: 'Local SQLite (Tauri)',
                description: 'Store everything locally with optional sync later. Best for offline-first.',
                icon: <Database className="h-5 w-5" />
        },
        {
                id: 'localStorage',
                title: 'Browser local only',
                description: 'Fastest startup with no network required. Stays on this device.',
                icon: <HardDrive className="h-5 w-5" />
        }
]

export function StorageOnboarding({ onSelect }: StorageOnboardingProps) {
        const renderOption = useMemo(
                () =>
                        ({ id, title, description, icon, badge }: StorageOption) => (
                                <Card
                                        key={id}
                                        className="h-full border-muted/70 shadow-none hover:border-primary/50 hover:shadow-sm transition"
                                >
                                        <CardHeader className="flex flex-row items-center gap-3">
                                                <span className="rounded-md bg-primary/10 p-2 text-primary">{icon}</span>
                                                <div className="flex flex-col gap-1">
                                                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                                                {title}
                                                                {badge ? (
                                                                        <Badge variant="secondary" className="text-xs">
                                                                                {badge}
                                                                        </Badge>
                                                                ) : null}
                                                        </CardTitle>
                                                        <CardDescription className="text-sm text-muted-foreground">
                                                                {description}
                                                        </CardDescription>
                                                </div>
                                        </CardHeader>
                                        <CardContent>
                                                <Button
                                                        className={cn(
                                                                'w-full justify-center',
                                                                id === 'drizzleLibsql'
                                                                        ? 'bg-primary text-primary-foreground'
                                                                        : 'bg-muted text-foreground hover:bg-muted/80'
                                                        )}
                                                        variant={id === 'drizzleLibsql' ? 'default' : 'secondary'}
                                                        onClick={() => onSelect({ adapter: id })}
                                                >
                                                        {id === 'drizzleLibsql' ? 'Use cloud sync' : 'Use this storage'}
                                                </Button>
                                        </CardContent>
                                </Card>
                        ),
                [onSelect]
        )

        return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/40 px-6 py-10">
                        <div className="w-full max-w-4xl space-y-8">
                                <div className="space-y-3 text-center">
                                        <p className="text-sm font-medium text-primary">Choose where to keep your notes</p>
                                        <h1 className="text-3xl font-bold tracking-tight">Local-first with optional cloud sync</h1>
                                        <p className="text-muted-foreground max-w-2xl mx-auto">
                                                Pick a storage target to get started. You can switch later from settings; your choice controls how
                                                notes sync between desktop and web.
                                        </p>
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                        {options.map(renderOption)}
                                </div>
                        </div>
                </div>
        )
}

