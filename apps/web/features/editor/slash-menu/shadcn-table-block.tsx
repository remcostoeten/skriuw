import { createReactBlockSpec } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { Plus, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '@skriuw/ui/table'
import { Button } from '@skriuw/ui/button'
import { Input } from '@skriuw/ui/input'

type TableBlockProps = {
	id: string
	type: 'shadcnTable'
	props: {
		tableData: string
	}
}

const ShadcnTableBlock = ({
	block,
	editor
}: {
	block: TableBlockProps
	editor: any
}) => {
	const [data, setData] = useState<string[][]>([])

	useEffect(() => {
		try {
			const parsed = JSON.parse(block.props.tableData as string)
			if (Array.isArray(parsed)) {
				setData(parsed)
			}
		} catch (e) {
			console.error('Failed to parse table data', e)
			setData([['Error', 'Parsing', 'Data']])
			// TODO: Replace with toast when available in @skriuw/ui
			if (typeof window !== 'undefined') {
				window.alert('Failed to load table data: Invalid format')
			}
		}
	}, [block.props.tableData])

	function updateTableData(newData: string[][]) {
		setData(newData)
		editor.updateBlock(block.id, {
			props: {
				tableData: JSON.stringify(newData)
			}
		})
	}

	function updateCell(rowIndex: number, colIndex: number, value: string) {
		const newData = [...data]
		if (newData[rowIndex]) {
			newData[rowIndex] = [...newData[rowIndex]]
			newData[rowIndex][colIndex] = value
			updateTableData(newData)
		}
	}

	function addRow() {
		if (data.length === 0) return
		const colCount = data[0].length
		const newRow = Array(colCount).fill('')
		updateTableData([...data, newRow])
	}

	function removeRow(index: number) {
		if (data.length <= 1) return // Keep at least one row
		const newData = data.filter((_, i) => i !== index)
		updateTableData(newData)
	}

	function addColumn() {
		const newData = data.map((row) => [...row, ''])
		updateTableData(newData)
	}

	function removeColumn(index: number) {
		if (data.length > 0 && data[0].length <= 1) return // Keep at least one col
		const newData = data.map((row) => row.filter((_, i) => i !== index))
		updateTableData(newData)
	}

	if (!data.length) return null

	return (
		<div className="my-4 rounded-md border p-1 group/table relative">
			{/* Controls Overlay - Visible on Hover */}
			<div className="absolute -top-8 right-0 hidden gap-2 group-hover/table:flex bg-background border rounded-md p-1 shadow-sm z-10">
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={addColumn}
					title="Add Column"
				>
					<Plus className="mr-1 h-3 w-3" /> Col
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={addRow}
					title="Add Row"
				>
					<Plus className="mr-1 h-3 w-3" /> Row
				</Button>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						{data[0]?.map((cell, colIndex) => (
							<TableHead
								key={`header-${colIndex}`}
								className="relative group/col min-w-[100px]"
							>
								<div className="flex items-center gap-1">
									<Input
										value={cell}
										onChange={(e) =>
											updateCell(
												0,
												colIndex,
												e.target.value
											)
										}
										className="h-8 border-transparent bg-transparent px-1 focus-visible:ring-1 font-bold"
										placeholder="Header"
									/>
									{data[0].length > 1 && (
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 opacity-0 group-hover/col:opacity-100 transition-opacity absolute right-0 top-1/2 -translate-y-1/2"
											onClick={() =>
												removeColumn(colIndex)
											}
										>
											<Trash className="h-3 w-3 text-muted-foreground hover:text-destructive" />
										</Button>
									)}
								</div>
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.slice(1).map((row, rowIndex) => (
						<TableRow key={`row-${rowIndex + 1}`}>
							{row.map((cell, colIndex) => (
								<TableCell
									key={`cell-${rowIndex + 1}-${colIndex}`}
									className="p-2 relative group/cell"
								>
									<Input
										value={cell}
										onChange={(e) =>
											updateCell(
												rowIndex + 1,
												colIndex,
												e.target.value
											)
										}
										className="h-9 border-transparent bg-transparent hover:bg-muted/30 px-2 focus-visible:ring-1 focus-visible:bg-background"
									/>
								</TableCell>
							))}
							{/* Row Actions */}
							<td className="w-8 opacity-0 group-hover/table:opacity-100 transition-opacity text-center p-0">
								<Button
									variant="ghost"
									size="icon"
									className="h-6 w-6"
									onClick={() => removeRow(rowIndex + 1)}
									title="Remove Row"
								>
									<Trash className="h-3 w-3 text-muted-foreground hover:text-destructive" />
								</Button>
							</td>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}

export const shadcnTableBlockSpec = createReactBlockSpec(
	{
		type: 'shadcnTable',
		propSchema: {
			tableData: {
				default: JSON.stringify([
					['Header 1', 'Header 2', 'Header 3'],
					['Cell 1', 'Cell 2', 'Cell 3'],
					['Cell 4', 'Cell 5', 'Cell 6']
				])
			}
		},
		content: 'none'
	},
	{
		render: ({ block, editor }) => (
			<ShadcnTableBlock
				block={block as TableBlockProps}
				editor={editor}
			/>
		)
	}
)
