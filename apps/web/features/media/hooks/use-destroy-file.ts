import { useMutation, useQueryClient } from '@tanstack/react-query'
import { destroyFile } from '../api/mutations/destroy-file'
import { MEDIA_KEYS } from './use-files-query'

export function useDestroyFileMutation() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: destroyFile,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: MEDIA_KEYS.all })
		}
	})
}
