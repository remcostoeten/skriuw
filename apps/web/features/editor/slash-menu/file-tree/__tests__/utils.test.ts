import { describe, expect, it } from 'bun:test'
import {
    buildTreeFromFiles,
    flattenTreeToFiles,
    updateNode,
    deleteNode,
    addChildNode,
    findNodeByPath,
    findNodeById,
    getLanguageFromPath,
    serializeTreeToAscii,
    parseAsciiTree
} from '../utils'
import type { TFile, TNode } from '../types'

describe('File Tree Utils', () => {
    // Sample data
    const sampleFiles: TFile[] = [
        { path: 'src/index.ts', content: 'console.log("hello")' },
        { path: 'src/components/Button.tsx', content: '<button />' },
        { path: 'package.json', content: '{}' }
    ]

    describe('buildTreeFromFiles', () => {
        it('should build a correct directory structure from flat files', () => {
            const tree = buildTreeFromFiles(sampleFiles)

            // Root level
            expect(tree.length).toBe(2) // src/ and package.json

            // src folder
            const srcNode = tree.find(n => n.name === 'src')
            expect(srcNode).toBeDefined()
            expect(srcNode?.type).toBe('folder')
            expect(srcNode?.children).toBeDefined()

            // package.json file
            const pkgNode = tree.find(n => n.name === 'package.json')
            expect(pkgNode).toBeDefined()
            expect(pkgNode?.type).toBe('file')
            expect(pkgNode?.path).toBe('package.json')
        })

        it('should handle nested structures', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const srcNode = tree.find(n => n.name === 'src')

            // src/index.ts
            const indexNode = srcNode?.children?.find(n => n.name === 'index.ts')
            expect(indexNode).toBeDefined()
            expect(indexNode?.type).toBe('file')

            // src/components/
            const componentsNode = srcNode?.children?.find(n => n.name === 'components')
            expect(componentsNode).toBeDefined()
            expect(componentsNode?.type).toBe('folder')

            // src/components/Button.tsx
            const buttonNode = componentsNode?.children?.find(n => n.name === 'Button.tsx')
            expect(buttonNode).toBeDefined()
            expect(buttonNode?.type).toBe('file')
            expect(buttonNode?.path).toBe('src/components/Button.tsx')
        })

        it('should sort files and folders correctly', () => {
            // Note: Current implementation sorts by path string, so folders/files are mixed alphabetically
            // or however localeCompare handles it
            const files: TFile[] = [
                { path: 'b.ts', content: '' },
                { path: 'a.ts', content: '' },
                { path: 'folder/c.ts', content: '' }
            ]
            const tree = buildTreeFromFiles(files)

            expect(tree[0].name).toBe('a.ts')
            expect(tree[1].name).toBe('b.ts')
            expect(tree[2].name).toBe('folder')
        })
    })

    describe('flattenTreeToFiles', () => {
        it('should convert tree back to flat file list', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const flattened = flattenTreeToFiles(tree)

            expect(flattened.length).toBe(3)
            expect(flattened.find(f => f.path === 'src/index.ts')).toBeDefined()
            expect(flattened.find(f => f.path === 'src/components/Button.tsx')).toBeDefined()
            expect(flattened.find(f => f.path === 'package.json')).toBeDefined()
        })

        it('should preserve content', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const flattened = flattenTreeToFiles(tree)
            const pkgFile = flattened.find(f => f.path === 'package.json')
            expect(pkgFile?.content).toBe('{}')
        })
    })

    describe('Node Operations', () => {
        it('should find node by path', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const node = findNodeByPath(tree, 'src/components/Button.tsx')
            expect(node).toBeDefined()
            expect(node?.name).toBe('Button.tsx')
        })

        it('should find node by id', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const target = tree[0] // src folder
            const found = findNodeById(tree, target.id)
            expect(found).toBe(target)
        })

        it('should update node properties', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const targetId = tree[0].id // src folder

            const updatedTree = updateNode(tree, targetId, { isExpanded: false })
            const updatedNode = findNodeById(updatedTree, targetId)

            expect(updatedNode?.isExpanded).toBe(false)
        })

        it('should delete node', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const targetId = tree.find(n => n.name === 'package.json')?.id

            if (!targetId) throw new Error('Target node not found')

            const updatedTree = deleteNode(tree, targetId)
            expect(findNodeById(updatedTree, targetId)).toBeNull()
            expect(updatedTree.length).toBe(1) // Only src/ remains
        })

        it('should add child node', () => {
            const tree = buildTreeFromFiles(sampleFiles)
            const srcNode = tree.find(n => n.name === 'src')
            if (!srcNode) throw new Error('src node not found')

            const newFile: TNode = {
                id: 'new-id',
                name: 'utils.ts',
                type: 'file',
                path: 'src/utils.ts',
                content: ''
            }

            const updatedTree = addChildNode(tree, srcNode.id, newFile)
            const updatedSrc = findNodeById(updatedTree, srcNode.id)

            expect(updatedSrc?.children?.find(n => n.name === 'utils.ts')).toBeDefined()
        })
    })

    describe('ASCII Serialization', () => {
        it('should serialize tree to ASCII representation', () => {
            const tree = buildTreeFromFiles([
                { path: 'src/index.ts', content: '' },
                { path: 'package.json', content: '' }
            ])

            // Note: The specific output format depends on sorting and implementation details
            // We check if it contains expected parts
            const ascii = serializeTreeToAscii(tree)
            expect(ascii).toContain('package.json')
            expect(ascii).toContain('src/')
            expect(ascii).toContain('index.ts')
        })

        it('should parse ASCII representation back to tree structure', () => {
            const ascii = `
├── src/
│   └── index.ts
└── package.json
`
            const tree = parseAsciiTree(ascii)
            expect(tree.length).toBe(2)

            const srcNode = tree.find(n => n.name === 'src')
            expect(srcNode).toBeDefined()
            expect(srcNode?.type).toBe('folder')

            const indexNode = srcNode?.children?.[0]
            expect(indexNode?.name).toBe('index.ts')
            expect(indexNode?.type).toBe('file')
        })
    })

    describe('Language Detection', () => {
        it('should detect languages from extensions', () => {
            expect(getLanguageFromPath('file.ts')).toBe('typescript')
            expect(getLanguageFromPath('file.tsx')).toBe('tsx')
            expect(getLanguageFromPath('file.json')).toBe('json')
            expect(getLanguageFromPath('file.unknown')).toBe('plaintext')
        })
    })
})
