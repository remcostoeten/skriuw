import { ShortcutId, KeyCombo } from "../shortcut-definitions";
import { ShortcutRecorder } from "./shortcut-recorder";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@skriuw/ui/table";
import { RotateCcw } from "lucide-react";
import { useMemo } from "react";

export type ShortcutState = {
	id: ShortcutId
	currentKeys: KeyCombo[]
	defaultKeys: KeyCombo[]
	description: string
	isCustomized: boolean
}

type ShortcutsListProps = {
	shortcuts: ShortcutState[]
	recordingId: ShortcutId | null
	onShortcutChange: (id: ShortcutId, keys: KeyCombo[]) => void
	onResetShortcut: (id: ShortcutId) => void
	onStartRecording: (id: ShortcutId) => void
	onStopRecording: () => void
}

export function ShortcutsList({
	shortcuts,
	recordingId,
	onShortcutChange,
	onResetShortcut,
	onStartRecording,
	onStopRecording
}: ShortcutsListProps) {
	// Group shortcuts by category (based on id prefix)
	const groupedShortcuts = useMemo(() => {
		const groups: Record<string, ShortcutState[]> = {}

		shortcuts.forEach((shortcut) => {
			const category = shortcut.id.split('-')[0] || 'other'
			if (!groups[category]) {
				groups[category] = []
			}
			groups[category].push(shortcut)
		})

		return groups
	}, [shortcuts])

	const categoryLabels: Record<string, string> = {
		editor: 'Editor',
		toggle: 'Toggles',
		create: 'Creation',
		open: 'Navigation',
		save: 'Saving',
		search: 'Searching',
		delete: 'Deletion',
		other: 'Other'
	}

	return (
		<div className='space-y-4'>
			{Object.entries(groupedShortcuts)
				.sort(([a], [b]) => {
					if (a === 'other') return 1
					if (b === 'other') return -1
					return a.localeCompare(b)
				})
				.map(([category, categoryShortcuts]) => (
					<div key={category}>
						<h3 className='text-sm font-semibold text-muted-foreground mb-2 px-1'>
							{categoryLabels[category] ||
								category.charAt(0).toUpperCase() + category.slice(1)}
						</h3>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className='w-[50%]'>Action</TableHead>
									<TableHead>Shortcut</TableHead>
									<TableHead className='text-right'>Reset</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{categoryShortcuts.map((shortcut) => (
									<TableRow key={shortcut.id}>
										<TableCell className='font-medium'>
											{shortcut.description}
										</TableCell>
										<TableCell>
											<ShortcutRecorder
												value={shortcut.currentKeys}
												onChange={(keys) =>
													onShortcutChange(shortcut.id, keys)
												}
												isRecording={recordingId === shortcut.id}
												onStartRecording={() =>
													onStartRecording(shortcut.id)
												}
												onStopRecording={onStopRecording}
												onCancel={onStopRecording}
											/>
										</TableCell>
										<TableCell className='text-right'>
											{shortcut.isCustomized && (
												<button
													onClick={() => onResetShortcut(shortcut.id)}
													className='p-1.5 rounded-md hover:bg-accent/50 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-ring'
													aria-label={`Reset ${shortcut.description} to default`}
													title='Reset to default'
												>
													<RotateCcw className='w-4 h-4 text-muted-foreground' />
												</button>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				))}
		</div>
	)
}
