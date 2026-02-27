import { createClientApiAdapter } from './adapters/client-api'
import type { StorageAdapter } from './adapters/types'

export type StoragePlatformTarget = 'web' | 'tauri-standard' | 'tauri-privacy' | 'expo'

export type NativeAdapterSet = {
	sqlite?: StorageAdapter
	filesystem?: StorageAdapter
	remote?: StorageAdapter
}

export type StorageAdapterSelectionOptions = {
	platform?: StoragePlatformTarget
	preferFilesystem?: boolean
	nativeAdapters?: NativeAdapterSet
	webAdapter?: StorageAdapter
}

function pickNativeLocalAdapter(
	nativeAdapters: NativeAdapterSet | undefined,
	preferFilesystem: boolean
): StorageAdapter | undefined {
	if (!nativeAdapters) return undefined
	if (preferFilesystem) {
		return nativeAdapters.filesystem ?? nativeAdapters.sqlite
	}
	return nativeAdapters.sqlite ?? nativeAdapters.filesystem
}

/**
 * Selects the app storage adapter per platform target.
 * Current behavior remains unchanged for web (client API strategy).
 */
export function selectStorageAdapter(options: StorageAdapterSelectionOptions = {}): StorageAdapter {
	const platform = options.platform ?? 'web'
	const preferFilesystem = options.preferFilesystem ?? false
	const webAdapter = options.webAdapter ?? createClientApiAdapter()
	const nativeLocal = pickNativeLocalAdapter(options.nativeAdapters, preferFilesystem)

	switch (platform) {
		case 'tauri-privacy':
			return nativeLocal ?? webAdapter
		case 'tauri-standard':
		case 'expo':
			return nativeLocal ?? options.nativeAdapters?.remote ?? webAdapter
		case 'web':
		default:
			return webAdapter
	}
}
