export type ProjectStatus = 'finished' | 'in-progress' | 'abandoned'

export type ProjectLinks = {
	live?: string
	repo?: string
	docs?: string
}

export type ProjectGithub = {
	owner: string
	repo: string
}

export type ProjectMedia = {
	type: 'image' | 'gif' | 'video'
	src: string
	alt: string
}

export type SandboxAction = {
	type: 'source' | 'star' | 'note'
	label: string
	href?: string
	note?: string
}

export type SandboxConfig = {
	variant: 'editor' | 'sync' | 'workflow'
	description?: string
	actions?: SandboxAction[]
}

export type Project = {
	slug: string
	title: string
	summary: string
	description: string
	dates: {
		start: string
		end?: string
	}
	categories: string[]
	status: ProjectStatus
	stack: string[]
	links?: ProjectLinks
	github?: ProjectGithub
	media?: ProjectMedia
	sandbox?: SandboxConfig
}
