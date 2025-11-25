import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const tableOfContentsSeed = {
  name: "Table of contents",
  content: [
  {
    "id": "tsmqwxqo8mjhxr0nzrsv1",
    "type": "paragraph",
    "props": {},
    "content": [
      {
        "type": "text",
        "text": "# Table of contents\n\nFor in the note view we want a ToC. This helps long docuemnts easily scanable.\n\n## Options\n\nWe a uto parse headings to be sections of ToC. Couple of strategies/things to consider\n\n* There might be out of the shelf solutions?\n\n* Does fontmatter have anythign to do with this?\n\n* Does blocknotejs (the editor) have something for this?\n\n* Do we just parse the headings? `#` as subject and `# as sections? What about ###`` ?\n\n* Once we have AI implemented we acn offer a option to let ai generate ToC?\n\nUX:\n\n* Must be togglable via keyboard shortcut\n\n* KBD must be configurable\n\n* ToC sections must be clicked for smooth scroll\n\nNice to have:\n\n* A system to add custom ToC additional sub-fields or headings without having to write `##` or whatever we use.\n",
        "styles": {}
      }
    ],
    "children": []
  }
]
} satisfies DefaultNote
