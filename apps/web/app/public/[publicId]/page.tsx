import { notFound } from 'next/navigation'

import { PublicNoteView } from '@/features/notes/components/public-note-view'

type PublicNotePageProps = {
	params: Promise<{ publicId: string }>
}

async function getPublicNote(publicId: string) {
	const baseUrl =
		process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
			? `https://${process.env.VERCEL_URL}`
			: `http://localhost:${process.env.PORT || 3000}`

	const url = new URL(`/api/public/notes/${publicId}`, baseUrl)

	const res = await fetch(url.toString(), {
		next: { revalidate: 0 },
		cache: 'no-store'
	})
	if (!res.ok) {
		return null
	}
	return res.json()
}

export default async function PublicNotePage({ params }: PublicNotePageProps) {
	const { publicId } = await params
	const data = await getPublicNote(publicId)
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
