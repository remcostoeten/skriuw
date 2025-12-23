import { Badge } from '@skriuw/ui'
import { ProjectStatus } from '../types/projects'

export function StatusBadge({ status }: { status: ProjectStatus }) {
	const tone = status === 'finished' ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30' : status === 'in-progress' ? 'bg-amber-500/10 text-amber-200 border-amber-500/30' : 'bg-rose-500/10 text-rose-200 border-rose-500/30'
	const label = status === 'finished' ? 'Finished' : status === 'in-progress' ? 'In progress' : 'Abandoned'
	return <Badge className={`border ${tone}`}>{label}</Badge>
}
