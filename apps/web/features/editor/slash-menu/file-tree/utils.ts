import { generateId } from '@skriuw/shared'
import type { TFile, TNode } from './types'
import { getLanguageFromPath } from './types'

export { getLanguageFromPath }

export function buildTreeFromFiles(files: TFile[]): TNode[] {
	const root: TNode[] = []
	const nodeMap = new Map<string, TNode>()

	const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))

	for (const file of sortedFiles) {
		const parts = file.path.split('/')
		let currentPath = ''
		let currentLevel = root

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]
			const isFile = i === parts.length - 1
			currentPath = currentPath ? `${currentPath}/${part}` : part

			let existingNode = nodeMap.get(currentPath)

			if (!existingNode) {
				existingNode = {
					id: generateId(),
					name: part,
					type: isFile ? 'file' : 'folder',
					path: currentPath,
					children: isFile ? undefined : [],
					content: isFile ? file.content : undefined,
					language: isFile ? file.language || getLanguageFromPath(file.path) : undefined,
					isExpanded: true
				}
				nodeMap.set(currentPath, existingNode)
				currentLevel.push(existingNode)
			}

			if (!isFile && existingNode.children) {
				currentLevel = existingNode.children
			}
		}
	}

	return root
}

export function flattenTreeToFiles(nodes: TNode[]): TFile[] {
	const files: TFile[] = []

	function traverse(nodeList: TNode[]) {
		for (const node of nodeList) {
			if (node.type === 'file') {
				files.push({
					path: node.path,
					content: node.content,
					language: node.language
				})
			} else if (node.children) {
				traverse(node.children)
			}
		}
	}

	traverse(nodes)
	return files
}

export function serializeTreeToAscii(
	nodes: TNode[],
	depth: number = 0,
	isLast: boolean[] = []
): string {
	let result = ''

	nodes.forEach((node, index) => {
		const isLastNode = index === nodes.length - 1
		const prefix = isLast
			.map((last, i) => (i === isLast.length - 1 ? '' : last ? '    ' : '│   '))
			.join('')

		const connector = depth === 0 ? '' : isLastNode ? '└── ' : '├── '
		const suffix = node.type === 'folder' ? '/' : ''

		result += prefix + connector + node.name + suffix + '\n'

		if (node.children) {
			result += serializeTreeToAscii(node.children, depth + 1, [...isLast, isLastNode])
		}
	})

	return result
}

export function parseAsciiTree(content: string): TNode[] {
	const lines = content.split('\n').filter((line) => line.trim())
	const root: TNode[] = []
	const stack: { node: TNode[]; depth: number }[] = [{ node: root, depth: -1 }]

	lines.forEach((line) => {
		const match = line.match(/^([│├└\s]*)([─\s]*)(.+)$/)
		if (!match) return

		const indent = match[1] + match[2]
		const name = match[3].trim()

		const indentLength = indent.replace(/\t/g, '    ').length
		const depth = Math.floor(indentLength / 4)

		const isFolder = name.endsWith('/')
		const cleanName = name.replace(/\/$/, '')

		const newNode: TNode = {
			id: generateId(),
			name: cleanName,
			type: isFolder ? 'folder' : 'file',
			path: cleanName,
			children: isFolder ? [] : undefined,
			isExpanded: true
		}

		while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
			stack.pop()
		}

		const parent = stack[stack.length - 1]
		parent.node.push(newNode)

		if (stack.length > 1) {
			const parentNode = findParentNode(root, parent.node)
			if (parentNode) {
				newNode.path = `${parentNode.path}/${cleanName}`
			}
		}

		if (isFolder) {
			stack.push({ node: newNode.children!, depth })
		}
	})

	return root
}

function findParentNode(nodes: TNode[], targetChildren: TNode[]): TNode | null {
	for (const node of nodes) {
		if (node.children === targetChildren) {
			return node
		}
		if (node.children) {
			const found = findParentNode(node.children, targetChildren)
			if (found) return found
		}
	}
	return null
}

export function findNodeById(nodes: TNode[], id: string): TNode | null {
	for (const node of nodes) {
		if (node.id === id) return node
		if (node.children) {
			const found = findNodeById(node.children, id)
			if (found) return found
		}
	}
	return null
}

export function findNodeByPath(nodes: TNode[], path: string): TNode | null {
	for (const node of nodes) {
		if (node.path === path) return node
		if (node.children) {
			const found = findNodeByPath(node.children, path)
			if (found) return found
		}
	}
	return null
}

export function updateNode(nodes: TNode[], id: string, updates: Partial<TNode>): TNode[] {
	return nodes.map((node) => {
		if (node.id === id) {
			return { ...node, ...updates }
		}
		if (node.children) {
			return { ...node, children: updateNode(node.children, id, updates) }
		}
		return node
	})
}

export function deleteNode(nodes: TNode[], id: string): TNode[] {
	return nodes
		.filter((node) => node.id !== id)
		.map((node) => {
			if (node.children) {
				return { ...node, children: deleteNode(node.children, id) }
			}
			return node
		})
}

export function addChildNode(nodes: TNode[], parentId: string, child: TNode): TNode[] {
	return nodes.map((node) => {
		if (node.id === parentId && node.children) {
			return { ...node, children: [...node.children, child] }
		}
		if (node.children) {
			return { ...node, children: addChildNode(node.children, parentId, child) }
		}
		return node
	})
}

export function getAllFilePaths(nodes: TNode[]): string[] {
	const paths: string[] = []

	function traverse(nodeList: TNode[]) {
		for (const node of nodeList) {
			if (node.type === 'file') {
				paths.push(node.path)
			} else if (node.children) {
				traverse(node.children)
			}
		}
	}

	traverse(nodes)
	return paths
}

export function getAllFolderPaths(nodes: TNode[]): string[] {
	const paths: string[] = []

	function traverse(nodeList: TNode[]) {
		for (const node of nodeList) {
			if (node.type === 'folder') {
				paths.push(node.path)
				if (node.children) {
					traverse(node.children)
				}
			}
		}
	}

	traverse(nodes)
	return paths
}

export function countFiles(nodes: TNode[]): number {
	let count = 0
	function traverse(nodeList: TNode[]) {
		for (const node of nodeList) {
			if (node.type === 'file') {
				count++
			} else if (node.children) {
				traverse(node.children)
			}
		}
	}
	traverse(nodes)
	return count
}

export function filterTreeByQuery(nodes: TNode[], query: string): TNode[] {
	if (!query.trim()) return nodes

	const lowerQuery = query.toLowerCase()

	function matches(node: TNode): boolean {
		if (node.name.toLowerCase().includes(lowerQuery)) return true
		if (node.children) {
			return node.children.some(matches)
		}
		return false
	}

	function filterNodes(nodeList: TNode[]): TNode[] {
		return nodeList.filter(matches).map((node) => {
			if (node.children) {
				return { ...node, children: filterNodes(node.children), isExpanded: true }
			}
			return node
		})
	}

	return filterNodes(nodes)
}

export const DEFAULT_TREE_FILES: TFile[] = [
	{ path: 'src/index.ts', content: 'export * from "./components";\nexport * from "./utils";' },
	{
		path: 'src/components/Button.tsx',
		content: 'export function Button({ children }) {\n  return <button>{children}</button>;\n}'
	},
	{ path: 'src/components/index.ts', content: 'export * from "./Button";' },
	{
		path: 'src/utils/helpers.ts',
		content:
			'export function cn(...classes: string[]) {\n  return classes.filter(Boolean).join(" ");\n}'
	},
	{ path: 'package.json', content: '{\n  "name": "my-project",\n  "version": "1.0.0"\n}' },
	{ path: 'README.md', content: '# My Project\n\nA sample project structure.' }
]
