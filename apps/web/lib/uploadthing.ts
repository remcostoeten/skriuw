import {
    generateUploadButton,
    generateUploadDropzone,
    generateReactHelpers
} from '@uploadthing/react'

import type { OurFileRouter } from '@/app/api/uploadthing/core'

export const UploadButton = generateUploadButton<OurFileRouter>() as any
export const UploadDropzone = generateUploadDropzone<OurFileRouter>() as any
export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>() as {
    useUploadThing: any,
    uploadFiles: any
}
