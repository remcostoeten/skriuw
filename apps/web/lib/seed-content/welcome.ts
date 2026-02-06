/**
 * Welcome note content - first impression for new users.
 * Shows capabilities by using them, not listing them.
 */

let idCounter = 0
const id = (prefix: string) => `${prefix}-welcome-${++idCounter}`

const h = (level: 1 | 2 | 3, text: string) => ({
	id: id('h'),
	type: 'heading' as const,
	props: { level, textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: [{ type: 'text' as const, text, styles: {} }],
	children: []
})

const p = (segments: Array<{ text: string; styles?: Record<string, boolean> }>) => ({
	id: id('p'),
	type: 'paragraph' as const,
	props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: segments.map((s) => ({ type: 'text' as const, text: s.text, styles: s.styles ?? {} })),
	children: []
})

const empty = () => p([{ text: '' }])

const bullet = (segments: Array<{ text: string; styles?: Record<string, boolean> }>) => ({
	id: id('li'),
	type: 'bulletListItem' as const,
	props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
	content: segments.map((s) => ({ type: 'text' as const, text: s.text, styles: s.styles ?? {} })),
	children: []
})

const check = (text: string, checked = false) => ({
	id: id('chk'),
	type: 'checkListItem' as const,
	props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', checked },
	content: [{ type: 'text' as const, text, styles: {} }],
	children: []
})

const code = (text: string, language = 'text') => ({
	id: id('code'),
	type: 'codeBlock' as const,
	props: { language },
	content: [{ type: 'text' as const, text, styles: {} }],
	children: []
})

export function getWelcomeContent(): any[] {
	idCounter = 0

	return [
		p([
			{ text: "You're looking at a " },
			{ text: 'Skriuw', styles: { bold: true } },
			{ text: ' note. Everything here is editable — try changing this sentence.' }
		]),

		empty(),

		h(2, 'This is a heading. Below is a code block.'),

		code(
			`// You're not reading docs. You're inside the editor.
// Press / anywhere to see what else you can create.
const idea = "just start typing"`,
			'typescript'
		),

		empty(),

		h(2, 'A checklist that actually works'),

		p([{ text: 'Click the boxes. They persist. Use these to think through anything.' }]),

		check('Try clicking this checkbox'),
		check('Create a new note with Ctrl+N'),
		check('Press / to see all block types (code, headings, dividers...)'),
		check('Type [[ to link this note to another one'),

		empty(),

		h(2, 'Link your thinking'),

		p([
			{ text: 'Type ' },
			{ text: '[[', styles: { code: true } },
			{ text: ' anywhere to reference another note. When you do, that note will show ' },
			{ text: 'this one', styles: { italic: true } },
			{ text: ' in its backlinks — so you can always trace how ideas connect.' }
		]),

		p([
			{
				text: "It's how you go from scattered notes to a web of connected thoughts, without folders or tags."
			}
		]),

		empty(),

		h(2, 'Keyboard-first'),

		bullet([{ text: 'Ctrl+N', styles: { code: true } }, { text: ' — new note' }]),
		bullet([
			{ text: 'Ctrl+P', styles: { code: true } },
			{ text: ' — search everything instantly' }
		]),
		bullet([{ text: '/', styles: { code: true } }, { text: ' — insert any block type' }]),
		bullet([{ text: '[[', styles: { code: true } }, { text: ' — link to another note' }]),
		bullet([
			{ text: 'Ctrl+\\', styles: { code: true } },
			{ text: ' — split view, two notes side by side' }
		]),

		empty(),

		p([{ text: 'No account required. Your notes live locally. ', styles: { italic: true } }]),
		p([{ text: 'Sign in only if you want them to persist across devices.' }]),

		empty(),

		p([{ text: 'Now delete this note and start writing.', styles: { bold: true } }])
	]
}
