import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'
import type { Block } from '@blocknote/core'

export const welcomeSeed = {
  name: 'Welcome',
  content: [
    {
      id: '1',
      type: 'paragraph',
      props: {},
      content: [],
      children: []
    } as Block
  ]
} satisfies DefaultNote