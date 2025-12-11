import { shortcut } from "@/features/shortcuts"
import { EmptyState } from "./ui/empty-state"

type Props = {
    onCreateNote: () => void
    onOpenCollection: () => void
}

export function SkriuwExplanation({ onCreateNote, onOpenCollection }: Props) {
    return (
        <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-6 py-12">
            <div className="flex flex-col items-center gap-6 mb-8">
                <div className="flex flex-col items-center gap-3">
                    <h1 className="text-4xl font-bold text-foreground font-brand">Skriuw</h1>
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <p className="text-sm italic">
                            <span className="font-mono">/skrɪu̯/</span> —{' '}
                            <span className="font-medium">Frisian, &quot;to write.&quot;</span>
                        </p>
                    </div>
                </div>

                <div className="max-w-lg text-center">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        A blazingly fast, privacy-focused note-taking app built for everyone. Prooviding
                        a opt-in system for all features (yes, ai is included) rather than the usual
                        opt-out system. The tools are here, you just need to opt-in.
                    </p>
                </div>
            </div>

            <EmptyState
                actions={[
                    {
                        label: 'Open Collection',
                        shortcut: shortcut().modifiers('Cmd').key('O'),
                        separator: true,
                        onClick: onOpenCollection,
                    },
                    {
                        label: 'Create Note',
                        shortcut: shortcut().modifiers('Cmd').key('N'),
                        separator: true,
                        onClick: onCreateNote,
                    },
                ]}
            />
        </div>
    )
}
