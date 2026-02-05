import { createReactInlineContentSpec } from '@blocknote/react'
import type { CSSProperties } from 'react'

type Props = {
	tagName: string
	tagColor: string
}

function TagMention({ tagName, tagColor }: Props) {
	const style: CSSProperties = {
		backgroundColor: `${tagColor}20`,
		borderColor: `${tagColor}40`,
		color: tagColor
	}

	return (
		<span className='skriuw-tag-mention' style={style} aria-label={`Tag ${tagName}`}>
			{tagName}
		</span>
	)
}

export const TagInline = createReactInlineContentSpec(
	{
		type: 'tag',
		propSchema: {
			tagName: {
				default: ''
			},
			tagId: {
				default: ''
			},
			tagColor: {
				default: '#6366f1'
			}
		},
		content: 'none'
	},
	{
		render: function render(props) {
			return (
				<TagMention
					tagName={props.inlineContent.props.tagName}
					tagColor={props.inlineContent.props.tagColor}
				/>
			)
		}
	}
)
