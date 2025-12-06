import { createReactStyleSpec } from '@blocknote/react'

export const Font = createReactStyleSpec(
	{
		type: 'font',
		propSchema: 'string',
	},
	{
		render: (props) => {
			const span = document.createElement('span')
			span.style.fontFamily = props.value
			props.contentRef(span)
		},
	}
)
