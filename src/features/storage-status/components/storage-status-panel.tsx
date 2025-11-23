import { X, Database, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

import { cn } from "@/shared/utilities";

import { getStorageInfo } from "../api/queries/get-storage-info";
import { getStorageStats } from "../api/queries/get-storage-stats";

import type { StorageKeyStats } from "../api/queries/get-storage-stats";
import type { StorageInfo } from "@/api/storage/generic-types";

interface StorageStatusPanelProps {
	isOpen: boolean
	onClose: () => void
}

export function StorageStatusPanel({ isOpen, onClose }: StorageStatusPanelProps) {
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
	const [storageStats, setStorageStats] = useState<StorageKeyStats[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadStorageInfo = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [info, stats] = await Promise.all([
				getStorageInfo(),
				getStorageStats(),
			]);
			setStorageInfo(info);
			setStorageStats(stats);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load storage info');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadStorageInfo();
		}
	}, [isOpen]);

	const formatBytes = (bytes?: number): string => {
		if (!bytes) return 'N/A';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	};

	const formatDate = (date?: Date): string => {
		if (!date) return 'Never';
		return new Date(date).toLocaleString();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed right-4 top-4 z-50 w-96 max-h-[calc(100vh-2rem)] overflow-hidden pointer-events-auto">
			<Card className="shadow-lg border-2 bg-background">
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Database className="h-5 w-5" />
							<CardTitle className="text-lg">Storage Status</CardTitle>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="icon"
								onClick={loadStorageInfo}
								disabled={isLoading}
								className="h-8 w-8"
							>
								<RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
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
					<CardDescription>Storage adapter information and statistics</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
					{error && (
						<div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					{storageInfo && (
						<div className="space-y-3">
							{/* Adapter Info */}
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Adapter</span>
									<Badge variant="secondary">{storageInfo.adapter}</Badge>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Type</span>
									<Badge variant="outline">{storageInfo.type}</Badge>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Status</span>
									<div className="flex items-center gap-2">
										{storageInfo.isOnline ? (
											<>
												<Wifi className="h-4 w-4 text-green-500" />
												<span className="text-sm text-green-500">Online</span>
											</>
										) : (
											<>
												<WifiOff className="h-4 w-4 text-muted-foreground" />
												<span className="text-sm text-muted-foreground">Offline</span>
											</>
										)}
									</div>
								</div>
							</div>

							{/* Capabilities */}
							<div className="space-y-2 pt-2 border-t">
								<div className="text-sm font-medium mb-2">Capabilities</div>
								<div className="grid grid-cols-2 gap-2">
									{Object.entries(storageInfo.capabilities).map(([key, value]) => (
										<div key={key} className="flex items-center justify-between text-xs">
											<span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
											<Badge variant={value ? "default" : "outline"} className="text-xs">
												{value ? "Yes" : "No"}
											</Badge>
										</div>
									))}
								</div>
							</div>

							{/* Statistics */}
							<div className="space-y-2 pt-2 border-t">
								<div className="text-sm font-medium mb-2">Statistics</div>
								<div className="space-y-1">
									<div className="flex items-center justify-between text-sm">
										<span>Total Items</span>
										<span className="font-medium">{storageInfo.totalItems}</span>
									</div>
									{storageInfo.sizeBytes && (
										<div className="flex items-center justify-between text-sm">
											<span>Storage Size</span>
											<span className="font-medium">{formatBytes(storageInfo.sizeBytes)}</span>
										</div>
									)}
									{storageInfo.lastSync && (
										<div className="flex items-center justify-between text-sm">
											<span>Last Sync</span>
											<span className="font-medium text-xs">{formatDate(storageInfo.lastSync)}</span>
										</div>
									)}
								</div>
							</div>

							{/* Storage Keys Breakdown */}
							{storageStats.length > 0 && (
								<div className="space-y-2 pt-2 border-t">
									<div className="text-sm font-medium mb-2">Storage Keys</div>
									<div className="space-y-2">
										{storageStats.map((stat) => (
											<div key={stat.key} className="rounded-md border p-2 bg-muted/30">
												<div className="flex items-center justify-between mb-1">
													<span className="text-xs font-medium truncate flex-1">{stat.key}</span>
													<Badge variant="secondary" className="ml-2">
														{stat.itemCount} {stat.itemCount === 1 ? 'item' : 'items'}
													</Badge>
												</div>
												{stat.sizeBytes && (
													<div className="text-xs text-muted-foreground">
														{formatBytes(stat.sizeBytes)}
													</div>
												)}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{isLoading && !storageInfo && (
						<div className="flex items-center justify-center py-8">
							<RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

