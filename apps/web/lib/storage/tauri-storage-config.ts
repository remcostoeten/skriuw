export type TauriStoragePaths = {
	dbPath: string
	fsDir: string
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

async function getInvoke(): Promise<TauriInvoke> {
	const core = await import('@tauri-apps/api/core')
	return core.invoke as TauriInvoke
}

export async function getTauriStoragePaths(): Promise<TauriStoragePaths> {
	const invoke = await getInvoke()
	return invoke<TauriStoragePaths>('tauri_storage_get_paths')
}

export async function setTauriStoragePaths(paths: Partial<TauriStoragePaths>): Promise<TauriStoragePaths> {
	const invoke = await getInvoke()
	return invoke<TauriStoragePaths>('tauri_storage_set_paths', {
		dbPath: paths.dbPath ?? null,
		fsDir: paths.fsDir ?? null
	})
}
