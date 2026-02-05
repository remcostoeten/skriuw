import { useTagsQuery } from "@/features/tags"
import { useMemo } from "react"

type TagItem = {
	id: string
	name: string
	color: string
	key: string
}

export function useTagMentions(): TagItem[] {
	const { data: tags = [] } = useTagsQuery()

	return useMemo(
		function memoTags() {
			return tags.map(function mapTag(tag) {
				return {
					id: tag.id,
					name: tag.name,
					color: tag.color,
					key: tag.name.toLowerCase()
				}
			})
		},
		[tags]
	)
}
