import { createClientApiAdapter } from '../lib/storage/adapters/client-api'
import { TauriFilesystemAdapter } from '../lib/storage/adapters/tauri-filesystem-adapter'
import { TauriSqliteAdapter } from '../lib/storage/adapters/tauri-sqlite-adapter'
import {
	selectStorageAdapter,
	type StorageAdapterSelectionOptions,
	type NativeAdapterSet
} from '../lib/storage/adapter-selector'
import { isTauriAvailable } from '@skriuw/shared'
import { setAdapter, hasAdapter } from '@skriuw/crud'

let initializationPromise: Promise<void> | null = null
let nativeAdapters: NativeAdapterSet = {}
let nativeConfigHydrated = false

const NATIVE_MODE_KEY = 'skriuw:native-storage-mode'
const NATIVE_FS_PREFERENCE_KEY = 'skriuw:native-prefer-filesystem'

export type NativeStorageMode = 'standard' | 'privacy'
type NativeStorageConfig = {
	mode: NativeStorageMode
	preferFilesystem: boolean
}

const DEFAULT_NATIVE_STORAGE_CONFIG: NativeStorageConfig = {
	mode: 'standard',
	preferFilesystem: false
}

let nativeStorageConfig: NativeStorageConfig = { ...DEFAULT_NATIVE_STORAGE_CONFIG }

function parseNativeMode(value: string | null): NativeStorageMode | null {
	if (value === 'standard' || value === 'privacy') return value
	return null
}

function parseBooleanPreference(value: string | null): boolean | null {
	if (value === 'true') return true
	if (value === 'false') return false
	return null
}

function hydrateNativeStorageConfigFromClient(): void {
	if (nativeConfigHydrated) return
	if (typeof window === 'undefined') return
	if (!isTauriAvailable()) return

	const persistedMode = parseNativeMode(window.localStorage.getItem(NATIVE_MODE_KEY))
	const persistedFsPreference = parseBooleanPreference(
		window.localStorage.getItem(NATIVE_FS_PREFERENCE_KEY)
	)

	if (persistedMode) {
		nativeStorageConfig.mode = persistedMode
	}
	if (persistedFsPreference !== null) {
		nativeStorageConfig.preferFilesystem = persistedFsPreference
	}

	nativeConfigHydrated = true
}

function ensureDefaultNativeAdaptersRegistered(): void {
	if (!isTauriAvailable()) return
	if (!nativeAdapters.sqlite) {
		nativeAdapters = {
			...nativeAdapters,
			sqlite: new TauriSqliteAdapter()
		}
	}
	if (!nativeAdapters.filesystem) {
		nativeAdapters = {
			...nativeAdapters,
			filesystem: new TauriFilesystemAdapter()
		}
	}
}

function resolvePlatformTarget(): StorageAdapterSelectionOptions['platform'] {
	if (!isTauriAvailable()) return 'web'
	return nativeStorageConfig.mode === 'privacy' ? 'tauri-privacy' : 'tauri-standard'
}

function getInitializationSelectionOptions(): StorageAdapterSelectionOptions {
	return {
		platform: resolvePlatformTarget(),
		preferFilesystem: nativeStorageConfig.preferFilesystem,
		nativeAdapters,
		webAdapter: createClientApiAdapter()
	}
}

/**
 * Ensures the @skriuw/crud adapter is initialized.
 * Safe to call multiple times - will only initialize once.
 */
export function ensureStorageInitialized(): void {
	if (hasAdapter()) return
	hydrateNativeStorageConfigFromClient()
	ensureDefaultNativeAdaptersRegistered()
	setAdapter(selectStorageAdapter(getInitializationSelectionOptions()))
}

export function ensureStorageInitializedWithOptions(options: StorageAdapterSelectionOptions): void {
	if (hasAdapter()) return
	setAdapter(selectStorageAdapter(options))
}

export function registerNativeStorageAdapters(adapters: NativeAdapterSet): void {
	nativeAdapters = { ...nativeAdapters, ...adapters }
}

export function configureNativeStorageMode(config: Partial<NativeStorageConfig>): void {
	nativeStorageConfig = {
		...nativeStorageConfig,
		...config
	}
}

export function setNativeStorageMode(mode: NativeStorageMode): void {
	nativeStorageConfig.mode = mode
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(NATIVE_MODE_KEY, mode)
	}
}

export function setNativeFilesystemPreference(preferFilesystem: boolean): void {
	nativeStorageConfig.preferFilesystem = preferFilesystem
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(NATIVE_FS_PREFERENCE_KEY, String(preferFilesystem))
	}
}

export function getNativeStorageModePreference(): NativeStorageMode {
	if (typeof window === 'undefined') return nativeStorageConfig.mode
	return parseNativeMode(window.localStorage.getItem(NATIVE_MODE_KEY)) ?? nativeStorageConfig.mode
}

export function getNativeFilesystemPreference(): boolean {
	if (typeof window === 'undefined') return nativeStorageConfig.preferFilesystem
	return (
		parseBooleanPreference(window.localStorage.getItem(NATIVE_FS_PREFERENCE_KEY)) ??
		nativeStorageConfig.preferFilesystem
	)
}

/**
 * Initialize the storage system with database (PostgreSQL via Drizzle)
 */
export async function initializeAppStorage(): Promise<void> {
	if (initializationPromise) {
		return initializationPromise
	}

	initializationPromise = performInitialization()
	return initializationPromise
}

async function performInitialization(): Promise<void> {
	try {
		ensureStorageInitialized()
	} catch (error) {
		initializationPromise = null
		console.error('Failed to initialize storage:', error)
		throw error
	}
}

/**
 * @description Reset storage completely (for development/testing)
 */
export async function _resetStorage(): Promise<void> {
	initializationPromise = null
	return initializeAppStorage()
}
