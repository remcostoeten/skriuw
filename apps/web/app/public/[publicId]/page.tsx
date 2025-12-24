import { notFound } from 'next/navigation'

import { PublicNoteView } from '@/features/notes/components/public-note-view'

type PublicNotePageProps = {
	params: { publicId: string }
}

async function getPublicNote(publicId: string) {
	const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/public/notes/${publicId}`, {
		next: { revalidate: 0 },
		cache: 'no-store',
	})
	if (!res.ok) {
		return null
	}
	return res.json()
}

export default async function PublicNotePage({ params }: PublicNotePageProps) {
	const data = await getPublicNote(params.publicId)
	if (!data?.note) {
		notFound()
	}

	return (
		<PublicNoteView
			name={data.note.name}
			author={data.note.author?.name ?? null}
			createdAt={data.note.createdAt}
			updatedAt={data.note.updatedAt}
			content={data.note.content}
			views={data.note.publicViews}
		/>
	)
}
