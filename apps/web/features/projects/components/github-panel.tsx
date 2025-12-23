import { Suspense, type ReactNode } from 'react'
import { Github, GitFork, Star, ShieldCheck, Clock } from 'lucide-react'
import { Skeleton } from '@skriuw/ui/skeleton'
import { Card } from '@skriuw/ui/card'
import { ProjectGithub } from '../types/projects'
import { getRepoData } from '../api/queries/github-project'
import { MotionPanel } from './motion-panel'

function GithubSkeleton() {
	return (
		<MotionPanel>
			<Card className="p-4 border border-border/60 bg-muted/20 space-y-3">
				<div className="flex items-center gap-2 text-muted-foreground">
					<Github className="h-4 w-4" aria-hidden />
					<span className="text-sm">Loading repository</span>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			</Card>
		</MotionPanel>
	)
}

async function GithubContent({ github }: { github: ProjectGithub }) {
	const data = await getRepoData(github)
	if (!data) {
		return null
	}

    function renderStat(label: string, value?: string | number, icon?: ReactNode) {
		if (!value) return null
		return (
			<div className="rounded-lg border border-border/60 bg-background/60 p-3 flex items-center gap-2 text-sm text-foreground">
				{icon}
				<span className="text-muted-foreground">{label}</span>
				<span className="font-medium text-foreground">{value}</span>
			</div>
		)
	}

	return (
		<MotionPanel>
			<Card className="p-4 border border-border/60 bg-muted/20 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2 text-sm text-foreground">
						<Github className="h-4 w-4" aria-hidden />
						<a
							href={data.url}
							target="_blank"
							rel="noreferrer"
							className="hover:text-primary"
						>
							Repository
						</a>
					</div>
					{data.license ? (
						<span className="inline-flex items-center gap-2 text-xs rounded-full border border-border/60 px-3 py-1 text-muted-foreground">
							<ShieldCheck className="h-4 w-4" aria-hidden />
							{data.license}
						</span>
					) : null}
				</div>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
					{renderStat('Stars', data.stars > 0 ? data.stars : undefined, <Star className="h-4 w-4" aria-hidden />)}
					{renderStat('Forks', data.forks, <GitFork className="h-4 w-4" aria-hidden />)}
					{renderStat('Created', new Date(data.createdAt).toLocaleDateString(), <Clock className="h-4 w-4" aria-hidden />)}
					{renderStat('Updated', new Date(data.updatedAt).toLocaleDateString(), <Clock className="h-4 w-4" aria-hidden />)}
				</div>
			</Card>
		</MotionPanel>
	)
}

export function GithubPanel({ github }: { github: ProjectGithub }) {
	return (
		<Suspense fallback={<GithubSkeleton />}>
			<GithubContent github={github} />
		</Suspense>
	)
}
