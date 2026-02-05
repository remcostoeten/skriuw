import { NextRequest, NextResponse } from 'next/server'
import { requireMutation } from '@/lib/api-auth'
import { getDatabase, files, eq, and } from '@skriuw/db'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/assets/redownload/:id - Refresh signed URL (stub for future S3/UploadThing)
export async function POST(request: NextRequest, { params }: RouteParams) {
	try {
		const auth = await requireMutation()
		if (!auth.authenticated) return auth.response
		const { userId } = auth

		const { id } = await params
		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const db = getDatabase()

		// Get the file
		const [file] = await db
			.select()
			.from(files)
			.where(and(eq(files.id, id), eq(files.userId, userId)))
			.limit(1)

		if (!file) {
			return NextResponse.json({ error: 'File not found' }, { status: 404 })
		}

		// For now, just return the existing URL
		// In future, this could refresh signed URLs for S3 or UploadThing
		let freshUrl = file.url

		// TODO: Implement URL refresh for different storage providers
		// switch (file.storageProvider) {
		//   case 's3':
		//     freshUrl = await getSignedS3Url(file.url)
		//     break
		//   case 'uploadthing':
		//     // UploadThing URLs don't expire, so just return existing
		//     break
		// }

		return NextResponse.json({
			id: file.id,
			url: freshUrl,
			storageProvider: file.storageProvider
		})
	} catch (error) {
		console.error('POST /api/assets/redownload/:id error:', error)
		return NextResponse.json({ error: 'Failed to refresh URL' }, { status: 500 })
	}
}
