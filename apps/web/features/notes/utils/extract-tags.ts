import type { Block } from '@blocknote/core'

type TagItem = {
	type: 'tag'
	props: {
		tagName: string
	}
}

function isTagItem(item: unknown): item is TagItem {
	if (!item || typeof item !== 'object') return false
	if (!('type' in item)) return false
	const candidate = item as { type: unknown; props?: unknown }
	if (candidate.type !== 'tag') return false
	if (!candidate.props || typeof candidate.props !== 'object') return false
	const props = candidate.props as { tagName?: unknown }
	return typeof props.tagName === 'string'
}

function addTags(tags: Map<string, string>, content: Block['content']) {
	if (!content || !Array.isArray(content)) return
	for (const item of content) {
		if (!isTagItem(item)) continue
		const name = item.props.tagName.trim()
		if (!name) continue
		const key = name.toLowerCase()
		if (!tags.has(key)) {
			tags.set(key, name)
		}
	}
}

export function extractTags(blocks: Block[]): string[] {
	const tags = new Map<string, string>()
	const stack = [...blocks]

	while (stack.length > 0) {
		const block = stack.pop()
		if (!block) continue
		addTags(tags, block.content)
		if (block.children && block.children.length > 0) {
			stack.push(...block.children)
		}
	}

	return Array.from(tags.values())
}
