import { createUploadthing } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'
import type { FileRouter } from 'uploadthing/types'

import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getDatabase, files } from '@skriuw/db'
import { generateId } from '@skriuw/shared'

const f = createUploadthing()

export const ourFileRouter: FileRouter = {
	coverImageUploader: f({
		image: {
			maxFileSize: '4MB',
			maxFileCount: 1
		}
	})
		.middleware(async ({ req }) => {
			const session = await auth.api.getSession({
				headers: await headers()
			})

			if (!session?.user) {
				throw new UploadThingError('Unauthorized')
			}

			return { userId: session.user.id, uploadedAt: Date.now() }
		})
		.onUploadComplete(async ({ metadata, file }) => {
			const db = getDatabase()
			await db.insert(files).values({
				id: generateId('file'),
				userId: metadata.userId,
				url: file.ufsUrl,
				name: file.name,
				originalName: file.name,
				size: file.size,
				type: file.type || 'unknown',
				storageProvider: 'uploadthing',
				isPublic: false,
				createdAt: Date.now()
			})
			return { url: file.ufsUrl }
		})
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
