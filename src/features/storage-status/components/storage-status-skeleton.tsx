import { Database, RefreshCw, X } from 'lucide-react'

import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/shared/ui/card'
import { Skeleton } from '@/shared/ui/skeleton'
import { getGenericStorage } from '@/api/storage/generic-storage-factory'

interface StorageStatusSkeletonProps {
	isOpen: boolean
	onClose: () => void
	categoryCount?: number
	itemsPerCategory?: number
}

/**
 * Get display name for storage adapter
 */
function getStorageAdapterDisplayName(): string {
	try {
		const storage = getGenericStorage();
		const adapterName = storage.name;
		
		// Format adapter names for display
		const displayNames: Record<string, string> = {
			'localStorage': 'Local Storage',
			'drizzleLibsqlHttp': 'LibSQL (HTTP)',
			'drizzleTauriSqlite': 'SQLite (Tauri)',
		};
		
		return displayNames[adapterName] || adapterName;
	} catch {
		return 'Unknown';
	}
}

/**
 * Skeleton loader for storage status panel
 * Mimics the exact structure of the loaded state
 */
export function StorageStatusSkeleton({
	isOpen,
	onClose,
	categoryCount = 3,
	itemsPerCategory = 2
}: StorageStatusSkeletonProps) {
	if (!isOpen) return null
	
	const storageAdapterName = getStorageAdapterDisplayName();

	return (
		<div className="fixed right-4 top-4 z-50 w-[600px] max-h-[calc(100vh-2rem)] overflow-hidden pointer-events-auto">
			<Card className="shadow-lg border-2 bg-background h-full flex flex-col">
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Database className="h-5 w-5" />
							<CardTitle className="text-lg">Data Browser</CardTitle>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="icon"
								disabled
								className="h-8 w-8"
							>
								<RefreshCw className="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={onClose}
								className="h-8 w-8"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-2 mt-1">
						<CardDescription>Loading storage data...</CardDescription>
						<Badge variant="outline" className="ml-auto text-xs">
							{storageAdapterName}
						</Badge>
					</div>

					<div className="relative mt-2">
						<Skeleton className="h-10 w-full" />
					</div>
				</CardHeader>

				<CardContent className="flex-1 overflow-hidden p-0">
					<div className="h-[calc(100vh-16rem)] px-4 space-y-4">
						{Array.from({ length: categoryCount }).map((_, categoryIdx) => (
							<div key={categoryIdx} className="space-y-2">
								{/* Category Header Skeleton */}
								<div className="w-full flex items-center gap-2 p-2 rounded-md">
									<Skeleton className="h-4 w-4" />
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-5 w-16 ml-auto" />
								</div>

								{/* Storage Keys Skeleton */}
								<div className="space-y-2 ml-2">
									{Array.from({ length: itemsPerCategory }).map(
										(_, keyIdx) => (
											<div
												key={keyIdx}
												className="border rounded-lg overflow-hidden"
											>
												{/* Key Header Skeleton */}
												<div className="w-full flex items-center justify-between p-2.5 bg-muted/20">
													<div className="flex items-center gap-2 flex-1">
														<Skeleton className="h-3.5 w-3.5" />
														<Skeleton className="h-3 w-48" />
														<Skeleton className="h-5 w-8 ml-auto" />
													</div>
													<div className="flex gap-1 ml-2">
														<Skeleton className="h-6 w-6" />
														<Skeleton className="h-6 w-6" />
													</div>
												</div>

												{/* Items Skeleton (collapsed state) */}
											</div>
										)
									)}
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

