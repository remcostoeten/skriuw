import { Project } from '../../types/projects'

const registry: Project[] = [
	{
		slug: 'skriuw-notebook',
		title: 'Skriuw Notebook',
		summary: 'Offline-first, privacy-safe editor with realtime sync and AI assists.',
		description:
			'An SSR-first workspace that keeps writing responsive even on spotty networks. It layers optimistic updates, offline persistence, and server-streamed AI replies to keep edits instantaneous.',
		dates: { start: '2024-02-14', end: '2024-11-05' },
		categories: ['notes', 'collaboration', 'ai'],
		status: 'finished',
		stack: ['Next.js', 'Edge DB', 'Tailwind', 'Framer'],
		links: { live: 'https://skriuw.app', docs: 'https://skriuw.app/docs' },
		github: { owner: 'skriuw', repo: 'skriuw' },
		media: { type: 'image', src: '/skriuw.png', alt: 'Skriuw editor experience' },
		sandbox: {
			variant: 'editor',
			description: 'Shows the inline slash command menu and instant AI summary chips.',
			actions: [
				{ type: 'source', label: 'View source', href: 'https://github.com/skriuw/skriuw' },
				{ type: 'star', label: 'Star on GitHub', href: 'https://github.com/skriuw/skriuw' },
			],
		},
	},
	{
		slug: 'relay-sync',
		title: 'Relay Sync',
		summary: 'Deterministic data sync layer for devices that drift offline.',
		description:
			'Implements a conflict-free sync path backed by CRDT merges and background reconciliation. It keeps task data resilient and ready to hydrate without blocking renders.',
		dates: { start: '2023-09-02', end: '2024-04-20' },
		categories: ['infrastructure', 'sync'],
		status: 'finished',
		stack: ['Rust', 'Next.js', 'Tauri'],
		links: { repo: 'https://github.com/skriuw/relay-sync' },
		github: { owner: 'skriuw', repo: 'relay-sync' },
		media: { type: 'gif', src: '/android-chrome-512x512.png', alt: 'Sync timeline' },
		sandbox: {
			variant: 'sync',
			description: 'Preview of staged sync events and deterministic merges.',
			actions: [
				{ type: 'note', label: 'CRDT flow', note: 'Snapshots merge without blocking UI paths.' },
			],
		},
	},
	{
		slug: 'orion-workflows',
		title: 'Orion Workflows',
		summary: 'Composable workflow canvas with keyboard-first controls.',
		description:
			'Built for multi-stage task orchestration with SSR-led surfaces and zero-cost transitions. The experience relies on streaming sections so the shell is always interactive.',
		dates: { start: '2025-01-15' },
		categories: ['productivity', 'design'],
		status: 'in-progress',
		stack: ['Next.js', 'Tailwind', 'Framer'],
		links: { live: 'https://orion.example.com' },
		media: { type: 'video', src: '/android-chrome-192x192.png', alt: 'Workflow board' },
		sandbox: {
			variant: 'workflow',
			description: 'Keyboard-driven block creation with animated affordances.',
			actions: [
				{ type: 'source', label: 'Design spec', href: 'https://orion.example.com/spec' },
			],
		},
	},
]

export function getProjects() {
	return registry
}

export function getProject(slug: string) {
	return registry.find(function match(project) {
		return project.slug === slug
	})
}
