import { createReactInlineContentSpec } from '@blocknote/react'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

type Props = {
	tagName: string
	tagColor: string
}

function TagMention({ tagName, tagColor }: Props) {
	const router = useRouter()

	const style: CSSProperties = {
		backgroundColor: `${tagColor}20`,
		borderColor: `${tagColor}40`,
		color: tagColor,
		cursor: 'pointer'
	}

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		router.push(`/tags/${encodeURIComponent(tagName)}`)
	}

	return (
		<span
			className='skriuw-tag-mention hover:opacity-80 transition-opacity'
			style={style}
			aria-label={`Tag ${tagName}`}
			role='link'
			tabIndex={0}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') handleClick(e as any)
			}}
		>
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
