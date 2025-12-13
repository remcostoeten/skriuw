import { createReactStyleSpec } from '@blocknote/react'
import { createElement } from 'react'

export const Font: any = createReactStyleSpec(
	{
		type: 'font',
		propSchema: 'string',
	},
	{
		render: (props) =>
			createElement('span', {
				style: { fontFamily: props.value },
				ref: props.contentRef,
			}),
	}
)
