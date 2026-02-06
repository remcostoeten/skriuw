import { getItems } from '@/features/notes/api/queries/get-items'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import type { Item } from '@/features/notes/types'
import { Alert, AlertDescription, AlertTitle } from '@skriuw/ui/alert'
import { Button } from '@skriuw/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@skriuw/ui/card'
import { Input } from '@skriuw/ui/input'
import { ExternalLink, FileText, Folder, RefreshCcw } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react'

export type NodeEntry = {
	id: string
	name: string
	type: 'note' | 'folder'
	path: string
	url: string
	updatedAt?: number
}

function flattenNodes(
	items: Item[],
	parentPath: string[],
	getNoteUrl: (id: string) => string
): NodeEntry[] {
	const entries: NodeEntry[] = []

	function walk(list: Item[], trail: string[]) {
		for (const item of list) {
			const nextTrail = [...trail, item.name]
			if (item.type === 'note') {
				entries.push({
					id: item.id,
					name: item.name,
					type: 'note',
					path: nextTrail.join(' / '),
					url: getNoteUrl(item.id),
					updatedAt: item.updatedAt
				})
			} else {
				entries.push({
					id: item.id,
					name: item.name,
					type: 'folder',
					path: nextTrail.join(' / '),
					url: `/archive?folder=${item.id}`,
					updatedAt: item.updatedAt
				})
				walk(item.children, nextTrail)
			}
		}
	}

	walk(items, parentPath)
	return entries
}

function sortNodes(entries: NodeEntry[]): NodeEntry[] {
	return [...entries].sort(function compare(first, second) {
		if (first.updatedAt && second.updatedAt && first.updatedAt !== second.updatedAt) {
			return second.updatedAt - first.updatedAt
		}
		return first.path.localeCompare(second.path)
	})
}

export default function NodePanel() {
	const [items, setItems] = useState<Item[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [query, setQuery] = useState('')
	const deferredQuery = useDeferredValue(query)

	const { getNoteUrl } = useNoteSlug(items)

	useEffect(function loadNodes() {
		let active = true
		async function fetchNodes() {
			setLoading(true)
			setError(null)
			try {
				const fetched = await getItems({ forceRefresh: true })
				if (active) {
					setItems(fetched)
				}
			} catch (loadError) {
				if (active) {
					setError(
						loadError instanceof Error ? loadError.message : 'Unable to load nodes'
					)
				}
			} finally {
				if (active) {
					setLoading(false)
				}
			}
		}
		fetchNodes()
		return function cleanup() {
			active = false
		}
	}, [])

	const allNodes = useMemo(
		function collectNodes() {
			return sortNodes(flattenNodes(items, [], getNoteUrl))
		},
		[items, getNoteUrl]
	)

	const filteredNodes = useMemo(
		function filterNodes() {
			if (!deferredQuery.trim()) return allNodes
			const term = deferredQuery.toLowerCase()
			return allNodes.filter(function match(node) {
				return (
					node.name.toLowerCase().includes(term) || node.path.toLowerCase().includes(term)
				)
			})
		},
		[allNodes, deferredQuery]
	)

	const nodeCounts = useMemo(
		function measureCounts() {
			const noteTotal = filteredNodes.filter(function byType(entry) {
				return entry.type === 'note'
			}).length
			const folderTotal = filteredNodes.length - noteTotal
			return { noteTotal, folderTotal, total: filteredNodes.length }
		},
		[filteredNodes]
	)

	function updateQuery(event: ChangeEvent<HTMLInputElement>) {
		setQuery(event.target.value)
	}

	async function reloadNodes() {
		setLoading(true)
		setError(null)
		try {
			const fetched = await getItems({ forceRefresh: true })
			setItems(fetched)
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : 'Unable to load nodes')
		} finally {
			setLoading(false)
		}
	}

	function renderNode(entry: NodeEntry) {
		const Icon = entry.type === 'note' ? FileText : Folder
		return (
			<li
				key={entry.id}
				className='flex items-center justify-between rounded-lg border border-border/70 bg-card/50 px-3 py-2 shadow-sm'
			>
				<div className='flex min-w-0 flex-col gap-1'>
					<span className='flex items-center gap-2 text-sm font-medium text-foreground'>
						<Icon className='h-4 w-4 text-muted-foreground' />
						{entry.name}
					</span>
					<span className='text-xs text-muted-foreground truncate' title={entry.path}>
						{entry.path}
					</span>
				</div>
				<a
					className='inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline'
					href={entry.url}
					aria-label={`Open ${entry.name}`}
				>
					Open
					<ExternalLink className='h-3.5 w-3.5' />
				</a>
			</li>
		)
	}

	return (
		<Card>
			<CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
				<div className='space-y-2'>
					<CardTitle className='text-xl'>Your nodes</CardTitle>
					<CardDescription>
						Live stats from your notes and folders. Links take you straight to the
						source.
					</CardDescription>
				</div>
				<div className='flex items-center gap-2'>
					<Button
						variant='outline'
						size='sm'
						onClick={function clearQuery() {
							setQuery('')
						}}
					>
						Clear
					</Button>
					<Button
						variant='secondary'
						size='sm'
						onClick={reloadNodes}
						className='inline-flex items-center gap-2'
					>
						<RefreshCcw className='h-4 w-4' />
						Reload
					</Button>
				</div>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='grid gap-3 rounded-lg border border-border/70 bg-muted/40 p-3 sm:grid-cols-3'>
					<div className='space-y-1'>
						<p className='text-xs text-muted-foreground'>Total nodes</p>
						<p className='text-2xl font-semibold'>{nodeCounts.total}</p>
					</div>
					<div className='space-y-1'>
						<p className='text-xs text-muted-foreground'>Notes</p>
						<p className='text-lg font-medium'>{nodeCounts.noteTotal}</p>
					</div>
					<div className='space-y-1'>
						<p className='text-xs text-muted-foreground'>Folders</p>
						<p className='text-lg font-medium'>{nodeCounts.folderTotal}</p>
					</div>
				</div>

				<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
					<p className='text-sm text-muted-foreground'>
						Search and open any node, even with hundreds in your workspace.
					</p>
					<div className='w-full max-w-sm'>
						<Input
							value={query}
							onChange={updateQuery}
							placeholder='Search nodes by name or path'
							aria-label='Search nodes'
						/>
					</div>
				</div>

				{error && (
					<Alert variant='destructive' className='border-destructive/30 bg-destructive/5'>
						<AlertTitle>Could not load nodes</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className='max-h-[440px] space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-card/60 p-2'>
					{loading ? (
						<div className='flex items-center justify-center py-12 text-muted-foreground'>
							Loading nodes…
						</div>
					) : filteredNodes.length === 0 ? (
						<div className='py-10 text-center text-sm text-muted-foreground'>
							No nodes found. Create a note to see it appear here.
						</div>
					) : (
						<ul className='space-y-2'>{filteredNodes.map(renderNode)}</ul>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
