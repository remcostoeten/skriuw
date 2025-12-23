'use client'

import { type KeyboardEvent } from 'react'
import { ArrowUpRight, Github, Link2 } from 'lucide-react'
import { Card } from '@skriuw/ui/card'
import { StatusBadge } from './status-badge'
import { StackPill } from './stack-pill'
import { MotionPanel } from './motion-panel'
import { Project } from '../types/projects'
import { formatRange } from '../utilities/format-date'
import { useRouter } from 'next/navigation'

export function ProjectCard({ project, index }: { project: Project; index: number }) {
	const router = useRouter()

	function renderStack(item: string) {
		return <StackPill key={item} label={item} />
	}

	function openDetail() {
		router.push(`/projects/${project.slug}`)
	}

	function handleKey(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			openDetail()
		}
	}

	return (
		<MotionPanel delay={index * 0.04}>
			<Card
				className="relative overflow-hidden border border-border/60 bg-gradient-to-br from-background to-muted/20 hover:border-primary/40 transition-colors"
				onClick={openDetail}
				onKeyDown={handleKey}
				tabIndex={0}
				role="button"
				aria-label={`Open ${project.title}`}
			>
				<div className="flex flex-col gap-4 p-6 h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<div className="flex items-center gap-3">
								<h3 className="text-xl font-semibold text-foreground">{project.title}</h3>
								<StatusBadge status={project.status} />
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
								{project.summary}
							</p>
						</div>
						<span className="text-xs text-muted-foreground/80 flex items-center gap-2">
							{formatRange(project)}
							<ArrowUpRight className="h-4 w-4" aria-hidden />
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-2" aria-label="Tech stack">
						{project.stack.map(renderStack)}
					</div>
					<div className="flex items-center gap-3 text-sm text-primary pt-2">
						{project.links?.repo || project.github ? (
							<a
								href={project.links?.repo ?? `https://github.com/${project.github?.owner}/${project.github?.repo}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
								onClick={function stop(event) {
									event.stopPropagation()
								}}
							>
								<Github className="h-4 w-4" aria-hidden />
								Repo
							</a>
						) : null}
						{project.links?.live ? (
							<a
								href={project.links.live}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
								onClick={function stop(event) {
									event.stopPropagation()
								}}
							>
								<Link2 className="h-4 w-4" aria-hidden />
								Live
							</a>
						) : null}
					</div>
				</div>
			</Card>
		</MotionPanel>
	)
}
