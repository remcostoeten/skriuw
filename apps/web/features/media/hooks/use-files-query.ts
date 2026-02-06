import { useQuery } from '@tanstack/react-query'
import { getFiles, type MediaFile } from '../api/queries/get-files'

export const MEDIA_KEYS = {
	all: ['media-files'] as const,
	list: () => [...MEDIA_KEYS.all, 'list'] as const
}

export function useFilesQuery() {
	return useQuery({
		queryKey: MEDIA_KEYS.list(),
		queryFn: () => getFiles(),
		staleTime: 1000 * 60 * 5 // 5 minutes (server doesn't change often unless we upload)
	})
}
