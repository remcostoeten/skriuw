import { createUploadthing } from 'uploadthing/next'
import { UploadThingError } from 'uploadthing/server'
import type { FileRouter } from 'uploadthing/types'

const f = createUploadthing()

export const ourFileRouter: FileRouter = {
    coverImageUploader: f({
        image: {
            maxFileSize: '4MB',
            maxFileCount: 1
        }
    })
        .middleware(async ({ req }) => {
            return { uploadedAt: Date.now() }
        })
        .onUploadComplete(async ({ metadata, file }) => {
            return { url: file.ufsUrl }
        })
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
