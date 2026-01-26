import { useState, useCallback } from 'react'
import { uploadFile, type UploadResult } from './upload-adapter'

type UseUploadOptions = {
    onSuccess?: (result: UploadResult) => void
    onError?: (error: Error) => void
}

export function useUpload(options: UseUploadOptions = {}) {
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const upload = useCallback(
        async (file: File, isGuest = false): Promise<UploadResult | null> => {
            setIsUploading(true)
            setError(null)

            try {
                const result = await uploadFile(file, isGuest)
                options.onSuccess?.(result)
                return result
            } catch (err) {
                const uploadError = err instanceof Error ? err : new Error('Upload failed')
                setError(uploadError)
                options.onError?.(uploadError)
                return null
            } finally {
                setIsUploading(false)
            }
        },
        [options]
    )

    return {
        upload,
        isUploading,
        error
    }
}
