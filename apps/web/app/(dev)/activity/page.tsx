import { ActivityPanel } from '@/features/activity/components/activity-panel'

export const metadata = {
    title: 'Activity | Skriuw',
    description: 'View your activity and contribution history'
}

export default function ActivityPage() {
    return (
        <div className="min-h-screen bg-zinc-950">
            <main className="container mx-auto px-4 py-8 max-w-5xl">
                <ActivityPanel />
            </main>
        </div>
    )
}
