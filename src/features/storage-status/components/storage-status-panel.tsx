import { X, Database, RefreshCw, ChevronRight, ChevronDown, Eye, Edit2, Trash2, Plus, Copy, Search, FileCode, MapPin, GripVertical, Sliders } from "lucide-react";
import { useState, useMemo, Suspense, useEffect, useCallback, useRef } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { useConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";
import { useToast } from "@/shared/ui/use-toast";

import { cn } from "@/shared/utilities";

import { create } from "@/api/storage/crud/create";
import { destroy } from "@/api/storage/crud/destroy";
import { update } from "@/api/storage/crud/update";
import { getGenericStorage } from "@/api/storage/generic-storage-factory";

import { restartStorage } from "../api/storage-management";
import { getStorageKeyMetadata } from "../api/storage-metadata";
import { useStorageData, categorizeStorageKeys } from "../hooks/useStorageData";

import { StorageStatusSkeleton } from "./storage-status-skeleton";

import type { CategorizedStorage } from "../hooks/useStorageData";
import type { BaseEntity } from "@/api/storage/generic-types";

interface StorageStatusPanelProps {
	isOpen: boolean
	onClose: () => void
}

// Get a preview of the item's actual data (not just metadata)
function getDataPreview(item: BaseEntity): string {
	const data = { ...item };
	// Remove metadata fields
	const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...dataWithoutMetadata } = data;
	
	// Get the most interesting fields
	const preview = Object.entries(dataWithoutMetadata)
		.slice(0, 2)
		.map(([key, value]) => {
			let displayValue = String(value);
			if (typeof value === 'string' && value.length > 50) {
				displayValue = value.substring(0, 50) + '...';
			} else if (typeof value === 'object') {
				displayValue = JSON.stringify(value).substring(0, 50) + '...';
			}
			return `${key}: ${displayValue}`;
		})
		.join(' | ');
	
	return preview || 'No data';
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
		
		return displayNames[adapterName] ?? adapterName;
	} catch {
		return 'Unknown';
	}
}

export function StorageStatusPanel({ isOpen, onClose }: StorageStatusPanelProps) {
	const { storageData, isLoading, error, reload, recentActivity, markKeyAsRead, eventLog, clearEventLog } = useStorageData(isOpen);
	const { toast } = useToast();
	const { confirm, ConfirmDialog } = useConfirmDialog();
	const [categorizedData, setCategorizedData] = useState<CategorizedStorage[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [editingItem, setEditingItem] = useState<{ key: string; item: BaseEntity } | null>(null);
	const [editedValue, setEditedValue] = useState("");
	const [viewingItem, setViewingItem] = useState<{ key: string; item: BaseEntity } | null>(null);
	const [addingToKey, setAddingToKey] = useState<string | null>(null);
	const [newItemValue, setNewItemValue] = useState("");
	const [activeTab, setActiveTab] = useState<"data" | "events">("data");
	const [isResetting, setIsResetting] = useState(false);
	const [resetPopoverOpen, setResetPopoverOpen] = useState(false);
	const [eventSearch, setEventSearch] = useState("");
	const [eventTypeFilter, setEventTypeFilter] = useState<"all" | "created" | "updated" | "deleted" | "changed" | "route" | "route-error">("all");
	const [eventTimeFilter, setEventTimeFilter] = useState<"5m" | "15m" | "1h" | "all">("15m");

	// Draggable and opacity state
	const [panelPosition, setPanelPosition] = useState({ x: window.innerWidth - 620, y: 20 });
	const [panelOpacity, setPanelOpacity] = useState(0.95);
	const [isDragging, setIsDragging] = useState(false);
	const [showOpacityControl, setShowOpacityControl] = useState(false);
	const dragRef = useRef<{ startX: number; startY: number; startPos: { x: number; y: number } } | null>(null);

	const PANEL_STORAGE_KEY = 'data-browser-panel-position';
	const OPACITY_STORAGE_KEY = 'data-browser-panel-opacity';

	// Load panel position and opacity from localStorage
	useEffect(() => {
		try {
			const savedPosition = localStorage.getItem(PANEL_STORAGE_KEY);
			const savedOpacity = localStorage.getItem(OPACITY_STORAGE_KEY);

			if (savedPosition) {
				const pos = JSON.parse(savedPosition) as { x: number; y: number };
				const boundedPos = {
					x: Math.max(0, Math.min(window.innerWidth - 600, pos.x)),
					y: Math.max(0, Math.min(window.innerHeight - 200, pos.y))
				};
				setPanelPosition(boundedPos);
			}

			if (savedOpacity) {
				const opacity = parseFloat(savedOpacity);
				if (!isNaN(opacity) && opacity >= 0.1 && opacity <= 1.0) {
					setPanelOpacity(opacity);
				}
			}
		} catch (error) {
			console.warn('Failed to load panel settings:', error);
		}
	}, []);

	// Save panel position and opacity to localStorage
	useEffect(() => {
		try {
			localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelPosition));
		} catch (error) {
			console.warn('Failed to save panel position:', error);
		}
	}, [panelPosition]);

	useEffect(() => {
		try {
			localStorage.setItem(OPACITY_STORAGE_KEY, panelOpacity.toString());
		} catch (error) {
			console.warn('Failed to save panel opacity:', error);
		}
	}, [panelOpacity]);

	// Drag handlers
	const handleMouseDown = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			startPos: { ...panelPosition }
		};
		setIsDragging(true);
	};

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!dragRef.current) return;

			const deltaX = e.clientX - dragRef.current.startX;
			const deltaY = e.clientY - dragRef.current.startY;

			const newX = dragRef.current.startPos.x + deltaX;
			const newY = dragRef.current.startPos.y + deltaY;

			// Keep within viewport bounds
			const boundedX = Math.max(0, Math.min(window.innerWidth - 600, newX));
			const boundedY = Math.max(0, Math.min(window.innerHeight - 200, newY));

			setPanelPosition({ x: boundedX, y: boundedY });
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			dragRef.current = null;
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, [isDragging]);

	const storageAdapterName = getStorageAdapterDisplayName();
	const activityCount = useMemo(() => Object.keys(recentActivity).length, [recentActivity]);
	const timeThreshold = useMemo(() => {
		const durationMap: Record<typeof eventTimeFilter, number> = {
			"5m": 5 * 60 * 1000,
			"15m": 15 * 60 * 1000,
			"1h": 60 * 60 * 1000,
			"all": 0
		};
		const duration = durationMap[eventTimeFilter];
		return duration === 0 ? 0 : Date.now() - duration;
	}, [eventTimeFilter]);
	const filteredEvents = useMemo(() => {
		const normalizedSearch = eventSearch.trim().toLowerCase();
		return eventLog.filter(entry => {
			if (timeThreshold && entry.timestamp < timeThreshold) {
				return false;
			}

			if (eventTypeFilter !== "all" && entry.eventType !== eventTypeFilter) {
				return false;
			}

			if (normalizedSearch.length > 0) {
				const combined = `${entry.storageKey} ${entry.description ?? ""} ${entry.eventType} ${entry.entityId ?? ""}`.toLowerCase();
				if (!combined.includes(normalizedSearch)) {
				 return false;
				}
			}

		 return true;
		});
	}, [eventLog, eventSearch, eventTypeFilter, timeThreshold]);

	const handleClearEvents = useCallback(async () => {
		const confirmed = await confirm({
			title: "Clear event log?",
			description: "This removes all recorded events. New activity will be captured going forward.",
			confirmText: "Clear log",
			cancelText: "Cancel",
			variant: "destructive",
		});

		if (!confirmed) return;
		clearEventLog();
		toast({
			title: "Event log cleared",
			description: "Listening for new events."
		});
	}, [clearEventLog, confirm, toast]);

	// Update categorized data when storage data changes (non-blocking)
	const categorized = useMemo(() => categorizeStorageKeys(storageData), [storageData]);

	useEffect(() => {
		if (categorized.length === 0) {
			setCategorizedData([]);
			return;
		}

		setCategorizedData(prev => 
			categorized.map(category => {
				const prevCategory = prev.find(cat => cat.category === category.category);

				return {
					...category,
					isExpanded: prevCategory?.isExpanded ?? false,
					keys: category.keys.map(keyData => {
						const prevKey = prevCategory?.keys.find(k => k.key === keyData.key);
						return {
							...keyData,
							isExpanded: prevKey?.isExpanded ?? false
						};
					})
				};
			})
		);
	}, [categorized]);

	// Handle Escape key to close panel
	useEffect(() => {
		if (!isOpen) return

		// Don't close if user is editing, viewing, or adding an item
		if (editingItem || viewingItem || addingToKey) return

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				onClose()
			}
		}

		window.addEventListener('keydown', handleEscape, true)
		return () => {
			window.removeEventListener('keydown', handleEscape, true)
		}
	}, [isOpen, editingItem, viewingItem, addingToKey, onClose])

	const toggleCategory = (categoryIndex: number) => {
		setCategorizedData(prev => 
			prev.map((cat, idx) => 
				idx === categoryIndex ? { ...cat, isExpanded: !cat.isExpanded } : cat
			)
		);
	};

	const toggleExpand = (categoryIndex: number, keyIndex: number, storageKey: string, currentlyExpanded: boolean) => {
		if (!currentlyExpanded) {
			markKeyAsRead(storageKey);
		}
		setCategorizedData(prev => 
			prev.map((cat, catIdx) => {
				if (catIdx !== categoryIndex) return cat;
				return {
					...cat,
					keys: cat.keys.map((data, idx) => 
						idx === keyIndex ? { ...data, isExpanded: !data.isExpanded } : data
					)
				};
			})
		);
	};

	const handleDelete = async (storageKey: string, itemId: string) => {
		const confirmed = await confirm({
			title: "Delete item?",
			description: "Are you sure you want to delete this item? This action cannot be undone.",
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
		});
		
		if (!confirmed) return;
		
		try {
			await destroy(storageKey, itemId);
			await reload();
		} catch (err) {
			console.error(err instanceof Error ? err.message : 'Failed to delete item');
		}
	};

	const handleEdit = (storageKey: string, item: BaseEntity) => {
		setEditingItem({ key: storageKey, item });
		setEditedValue(JSON.stringify(item, null, 2));
	};

	const handleSaveEdit = async () => {
		if (!editingItem) return;
		
		try {
			const updatedData = JSON.parse(editedValue);
			await update(editingItem.key, editingItem.item.id, updatedData);
			setEditingItem(null);
			setEditedValue("");
			await reload();
		} catch (err) {
			console.error(err instanceof Error ? err.message : 'Failed to save changes');
		}
	};

	const handleView = (storageKey: string, item: BaseEntity) => {
		setViewingItem({ key: storageKey, item });
	};

	const handleCopy = (text: string) => {
		navigator.clipboard.writeText(text);
	};

	const handleAddNew = (storageKey: string) => {
		setAddingToKey(storageKey);
		setNewItemValue(JSON.stringify({ 
			// Add your data here
		}, null, 2));
	};

	const handleSaveNew = async () => {
		if (!addingToKey) return;
		
		try {
			const newData = JSON.parse(newItemValue);
			await create(addingToKey, newData);
			setAddingToKey(null);
			setNewItemValue("");
			await reload();
		} catch (err) {
			console.error(err instanceof Error ? err.message : 'Failed to create item');
		}
	};

	const handleResetStorage = async () => {
		if (isResetting) return;
		setResetPopoverOpen(false);

		try {
			setIsResetting(true);
			// Clear categorized data state first to force a fresh load
			setCategorizedData([]);
			await restartStorage();
			// Wait a bit for storage to settle
			await new Promise(resolve => setTimeout(resolve, 100));
			// Force a full reload
			await reload();
			// Reload again after a short delay to ensure everything is updated
			setTimeout(async () => {
				await reload();
			}, 200);
			toast({
				title: "Storage reset",
				description: "All data has been cleared and restored to the initial seed."
			});
		} catch (err) {
			console.error(err instanceof Error ? err.message : err);
			toast({
				variant: "destructive",
				title: "Failed to reset storage",
				description: err instanceof Error ? err.message : "Unknown error"
			});
		} finally {
			setIsResetting(false);
		}
	};

	const filteredData = categorizedData.map(cat => ({
		...cat,
		keys: cat.keys.filter(data => 
			data.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
			data.items.some(item => JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase()))
		)
	})).filter(cat => cat.keys.length > 0);

	const formatDate = (timestamp?: number): string => {
		if (!timestamp) return 'N/A';
		return new Date(timestamp).toLocaleString();
	};
	const formatLogTimestamp = (timestamp: number): string => {
		return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
	};

	if (!isOpen) return null;

	// Show skeleton during initial load
	if (isLoading && categorizedData.length === 0) {
		return <StorageStatusSkeleton isOpen={isOpen} onClose={onClose} />;
	}

	return (
		<>
			<ConfirmDialog />
			<Suspense fallback={<StorageStatusSkeleton isOpen={isOpen} onClose={onClose} />}>
				<div
				className="fixed z-50 w-[600px] max-h-[calc(100vh-2rem)] overflow-hidden pointer-events-auto"
				style={{
					left: `${panelPosition.x}px`,
					top: `${panelPosition.y}px`,
					opacity: panelOpacity,
					cursor: isDragging ? 'grabbing' : 'default'
				}}
			>
			<Card className="shadow-lg border-2 bg-background h-full flex flex-col backdrop-blur-sm">
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{/* Drag handle */}
							<div
								onMouseDown={handleMouseDown}
								className="p-1 rounded-md hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors"
								title="Drag to move panel"
							>
								<GripVertical className="h-4 w-4 text-muted-foreground" />
							</div>
							<Database className="h-5 w-5" />
							<CardTitle className="text-lg">Data Browser</CardTitle>
						</div>
						<div className="flex items-center gap-2">
							<Popover open={resetPopoverOpen} onOpenChange={setResetPopoverOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										disabled={isResetting || isLoading}
										className="h-8 px-3 text-xs font-medium flex items-center gap-2"
									>
										<RefreshCw className={cn("h-3.5 w-3.5", isResetting && "animate-spin")} />
										<span>Reset storage</span>
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-64 p-3" align="end">
									<div className="space-y-3">
										<div className="space-y-1">
											<p className="text-sm font-medium">Reset storage?</p>
											<p className="text-xs text-muted-foreground">
												This will remove all stored data and restore the default seed content. This action cannot be undone.
											</p>
										</div>
										<div className="flex gap-2 justify-end">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setResetPopoverOpen(false)}
												className="h-7 px-3 text-xs"
											>
												Cancel
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onClick={handleResetStorage}
												disabled={isResetting}
												className="h-7 px-3 text-xs text-white"
											>
												Reset
											</Button>
										</div>
									</div>
								</PopoverContent>
							</Popover>
							<Button
								variant="ghost"
								size="icon"
								onClick={reload}
								disabled={isLoading}
								className="h-8 w-8"
							>
								<RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
							</Button>
							{/* Opacity control */}
							<Popover open={showOpacityControl} onOpenChange={setShowOpacityControl}>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										title="Adjust opacity"
									>
										<Sliders className="h-4 w-4" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-48 p-3" align="end">
									<div className="space-y-3">
										<div className="space-y-1">
											<div className="flex items-center justify-between">
												<label className="text-sm font-medium">Opacity</label>
												<span className="text-xs text-muted-foreground">
													{Math.round(panelOpacity * 100)}%
												</span>
											</div>
											<Slider
												value={[panelOpacity]}
												onValueChange={(value) => setPanelOpacity(value[0])}
												min={0.1}
												max={1.0}
												step={0.05}
												className="w-full"
											/>
										</div>
										<div className="flex gap-2 justify-end">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setPanelOpacity(0.95)}
												className="h-7 px-2 text-xs"
											>
												Reset
											</Button>
										</div>
									</div>
								</PopoverContent>
							</Popover>
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
						<CardDescription>View and manage all your stored data</CardDescription>
						<Badge variant="outline" className="ml-auto text-xs">
							{storageAdapterName}
						</Badge>
					</div>
					
					<div className="relative mt-2">
						<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search keys or data..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-8"
						/>
					</div>
				</CardHeader>

				<CardContent className="flex-1 overflow-hidden p-0 flex flex-col relative">
					{error && (
						<div className="mx-4 mb-3 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					<Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "data" | "events")} className="flex-1 flex flex-col">
						<TabsList className="mx-4 mb-2 grid grid-cols-2">
							<TabsTrigger value="data" className="flex items-center justify-center gap-2 text-sm">
								Data
								{activityCount > 0 && (
									<Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
										{activityCount} new
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="events" className="flex items-center justify-center gap-2 text-sm">
								Events
								{eventLog.length > 0 && (
									<Badge variant="outline" className="text-[10px]">
										{eventLog.length}
									</Badge>
								)}
							</TabsTrigger>
						</TabsList>

						<TabsContent value="data" className="flex-1 focus-visible:outline-none focus-visible:ring-0">
							<ScrollArea className="h-[calc(100vh-16rem)] px-4">
								{isLoading && categorizedData.length === 0 ? (
									<div className="flex items-center justify-center py-8">
										<RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
									</div>
								) : filteredData.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground text-sm">
										{searchQuery ? 'No matching data found' : 'No data stored yet'}
									</div>
								) : (
									<div className="space-y-4 pb-4">
										{filteredData.map((category, categoryIndex) => {
											const categoryHasUpdates = category.keys.some((keyData) => Boolean(recentActivity[keyData.key]));
											return (
												<div key={category.category} className="space-y-2">
													{/* Category Header */}
													<button
														onClick={() => toggleCategory(categoryIndex)}
														className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
													>
														{category.isExpanded ? (
															<ChevronDown className="h-4 w-4" />
														) : (
															<ChevronRight className="h-4 w-4" />
														)}
														<span className="font-semibold text-sm flex items-center gap-2">
															{category.category}
															{categoryHasUpdates && (
																<span className="flex items-center gap-1 text-[10px] uppercase text-emerald-600 font-semibold">
																	<span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
																	Live
																</span>
															)}
														</span>
														<Badge variant="outline" className="ml-auto">
															{category.keys.reduce((sum, k) => sum + k.items.length, 0)} items
														</Badge>
													</button>

													{/* Storage Keys in Category */}
													{category.isExpanded && (
														<div className="space-y-2 ml-2">
															{category.keys.map((data, keyIndex) => {
																const keyActivity = recentActivity[data.key]
																return (
																	<div key={data.key} className="border rounded-lg overflow-hidden">
																		{/* Key Header */}
																		<button
																			onClick={() => toggleExpand(categoryIndex, keyIndex, data.key, data.isExpanded)}
																			className="w-full flex items-center justify-between p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors"
																		>
																			<div className="flex items-center gap-2 flex-1 min-w-0">
																				{data.isExpanded ? (
																					<ChevronDown className="h-3.5 w-3.5 shrink-0" />
																				) : (
																					<ChevronRight className="h-3.5 w-3.5 shrink-0" />
																				)}
																				<div className="flex flex-col items-start flex-1 min-w-0">
																					<div className="flex items-center gap-2">
																						<span className="text-xs font-medium truncate">{data.key}</span>
																						{(() => {
																							const metadata = getStorageKeyMetadata(data.key);
																							return metadata && (
																								<TooltipProvider delayDuration={100}>
																									<Tooltip>
																										<TooltipTrigger asChild>
																											<div className="flex items-center gap-1">
																												{metadata.route && (
																													<MapPin className="h-3 w-3 text-blue-500" />
																												)}
																												<FileCode className="h-3 w-3 text-muted-foreground" />
																											</div>
																										</TooltipTrigger>
																										<TooltipContent side="right" className="max-w-xs">
																											<div className="space-y-1 text-xs">
																												<div className="font-semibold">{metadata.feature}</div>
																												<div className="text-muted-foreground">{metadata.description}</div>
																												{metadata.route && (
																													<div className="flex items-center gap-1 text-blue-400">
																														<MapPin className="h-3 w-3" />
																														<span>{metadata.route}</span>
																													</div>
																												)}
																												<div className="pt-1 border-t mt-1">
																													<div className="font-medium mb-0.5">Used in:</div>
																													{metadata.usedIn.map((file, idx) => (
																														<div key={idx} className="text-muted-foreground font-mono text-[10px]">
																															{file}
																														</div>
																													))}
																												</div>
																											</div>
																										</TooltipContent>
																									</Tooltip>
																								</TooltipProvider>
																							);
																						})()}
																					</div>
																					{keyActivity && (
																						<div className="flex items-center gap-1 text-[10px] uppercase text-emerald-600 font-semibold">
																							<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
																							{keyActivity.count} new
																						</div>
																					)}
																				</div>
																				<Badge variant="secondary" className="ml-auto shrink-0">
																					{data.items.length}
																				</Badge>
																			</div>
																			<div className="flex gap-1 ml-2">
																				<Button
																					variant="ghost"
																					size="icon"
																					className="h-6 w-6"
																					onClick={(e) => {
																						e.stopPropagation();
																						handleAddNew(data.key);
																					}}
																					title="Add new item"
																				>
																					<Plus className="h-3 w-3" />
																				</Button>
																				<Button
																					variant="ghost"
																					size="icon"
																					className="h-6 w-6"
																					onClick={(e) => {
																						e.stopPropagation();
																						handleCopy(data.key);
																					}}
																					title="Copy key name"
																				>
																					<Copy className="h-3 w-3" />
																				</Button>
																			</div>
																		</button>

																		{/* Items List */}
																		{data.isExpanded && (
																			<div className="divide-y">
																				{data.items.length === 0 ? (
																					<div className="p-4 text-sm text-muted-foreground text-center">
																						No items in this storage key
																					</div>
																				) : (
																					data.items.map((item) => (
																						<div key={item.id} className="p-3 bg-background hover:bg-muted/20 transition-colors">
																							<div className="flex items-start justify-between gap-3">
																								<div className="flex-1 min-w-0 space-y-1.5">
																									<div className="flex items-center gap-2">
																										<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
																											{item.id.slice(0, 8)}
																										</code>
																										<span className="text-[10px] text-muted-foreground">
																											{formatDate(item.updatedAt)}
																										</span>
																									</div>
																									{/* Data Preview */}
																									<div className="text-xs text-foreground/80 line-clamp-2 bg-muted/30 p-2 rounded">
																										{getDataPreview(item)}
																									</div>
																								</div>
																								<div className="flex gap-1 shrink-0">
																									<Button
																										variant="ghost"
																										size="icon"
																										className="h-7 w-7"
																										onClick={() => handleView(data.key, item)}
																										title="View full data"
																									>
																										<Eye className="h-3.5 w-3.5" />
																									</Button>
																									<Button
																										variant="ghost"
																										size="icon"
																										className="h-7 w-7"
																										onClick={() => handleEdit(data.key, item)}
																										title="Edit item"
																									>
																										<Edit2 className="h-3.5 w-3.5" />
																									</Button>
																									<Button
																										variant="ghost"
																										size="icon"
																										className="h-7 w-7 text-destructive hover:text-destructive"
																										onClick={() => handleDelete(data.key, item.id)}
																										title="Delete item"
																									>
																										<Trash2 className="h-3.5 w-3.5" />
																									</Button>
																								</div>
																							</div>
																						</div>
																					))
																				)}
																			</div>
																		)}
																	</div>
																)
															})}
														</div>
													)}
												</div>
											)
										})}
									</div>
								)}
							</ScrollArea>
						</TabsContent>

						<TabsContent value="events" className="flex-1 focus-visible:outline-none focus-visible:ring-0">
							<div className="px-4 space-y-2 pb-2">
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<div className="relative flex-1">
											<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
											<Input
												value={eventSearch}
												onChange={(e) => setEventSearch(e.target.value)}
												placeholder="Search key, event type, description..."
												className="pl-8"
											/>
										</div>
										<Select value={eventTypeFilter} onValueChange={(value) => setEventTypeFilter(value as typeof eventTypeFilter)}>
											<SelectTrigger className="w-[150px]">
												<SelectValue placeholder="Event type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All events</SelectItem>
												<SelectItem value="created">Created</SelectItem>
												<SelectItem value="updated">Updated</SelectItem>
												<SelectItem value="deleted">Deleted</SelectItem>
												<SelectItem value="changed">Changed</SelectItem>
												<SelectItem value="route">Route changes</SelectItem>
												<SelectItem value="route-error">Route errors</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-center gap-2 flex-wrap text-[11px] uppercase text-muted-foreground tracking-wide">
										<span>Time window:</span>
										{(["5m", "15m", "1h", "all"] as const).map((window) => (
											<Button
												key={window}
												variant={eventTimeFilter === window ? "default" : "outline"}
												size="sm"
												className="h-7 px-2 text-[11px]"
												onClick={() => setEventTimeFilter(window)}
											>
												{window === "all" ? "All" : window.toUpperCase()}
											</Button>
										))}
										<div className="ml-auto flex items-center gap-2">
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-[11px]"
												onClick={handleClearEvents}
												disabled={eventLog.length === 0}
											>
												<Trash2 className="h-3.5 w-3.5 mr-1" />
												Clear events
											</Button>
										</div>
									</div>
								</div>
							</div>
							<ScrollArea className="h-[calc(100vh-19rem)] px-4">
								{filteredEvents.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground text-sm">
										{eventLog.length === 0 ? 'Live events will appear here as changes flow in.' : 'No events match the selected filters.'}
									</div>
								) : (
									<div className="pb-4">
										<div className="text-[11px] font-mono text-muted-foreground mb-2 flex items-center justify-between">
											<span>{filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} shown</span>
											<span>{eventLog.length} total captured</span>
										</div>
										<div className="rounded border bg-black/80 text-emerald-100 font-mono text-[11px] overflow-hidden">
											{filteredEvents.map((entry) => (
												<div key={entry.id} className="border-b border-white/5 px-3 py-2 hover:bg-white/5 transition-colors">
													<div className="flex flex-wrap items-center gap-2">
														<span className="text-amber-300">{formatLogTimestamp(entry.timestamp)}</span>
														<span className="uppercase tracking-wider text-emerald-400">{entry.eventType}</span>
														<span className="text-white truncate">{entry.storageKey}</span>
														{entry.entityId && (
															<span className="text-muted-foreground">#{entry.entityId.slice(0, 8)}</span>
														)}
													</div>
													<div className="mt-1 text-xs text-emerald-200/80 flex flex-wrap gap-2">
														<span className="opacity-70">source:{entry.source}</span>
														{entry.description && (
															<span className="text-white">{entry.description}</span>
														)}
													</div>
												</div>
										))}
										</div>
									</div>
								)}
							</ScrollArea>
						</TabsContent>
					</Tabs>

					{/* View/Edit/Add Modal */}
					{(viewingItem || editingItem || addingToKey) && (
						<div className="absolute inset-0 bg-background/95 z-10 p-4 flex flex-col">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-medium">
									{editingItem ? 'Edit Item' : addingToKey ? `Add New Item to ${addingToKey}` : 'View Item'}
								</h3>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => {
										setViewingItem(null);
										setEditingItem(null);
										setEditedValue("");
										setAddingToKey(null);
										setNewItemValue("");
									}}
									className="h-8 w-8"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
							
							<ScrollArea className="flex-1 mb-3">
								{(editingItem || addingToKey) ? (
									<textarea
										value={addingToKey ? newItemValue : editedValue}
										onChange={(e) => addingToKey ? setNewItemValue(e.target.value) : setEditedValue(e.target.value)}
										className="w-full h-full min-h-[300px] p-3 font-mono text-xs bg-muted rounded-md"
										placeholder={addingToKey ? 'Enter JSON data for new item...' : ''}
									/>
								) : (
									<pre className="p-3 font-mono text-xs bg-muted rounded-md overflow-x-auto">
										{JSON.stringify(viewingItem?.item, null, 2)}
									</pre>
								)}
							</ScrollArea>

							{(editingItem || addingToKey) && (
								<div className="flex gap-2">
									<Button 
										onClick={addingToKey ? handleSaveNew : handleSaveEdit} 
										size="sm" 
										className="flex-1"
									>
										{addingToKey ? 'Create Item' : 'Save Changes'}
									</Button>
									<Button 
										variant="outline" 
										size="sm"
										onClick={() => {
											setEditingItem(null);
											setEditedValue("");
											setAddingToKey(null);
											setNewItemValue("");
										}}
									>
										Cancel
									</Button>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
		</Suspense>
		</>
	);
}
