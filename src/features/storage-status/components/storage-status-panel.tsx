import { X, Database, RefreshCw, ChevronRight, ChevronDown, Eye, Edit2, Trash2, Plus, Copy, Search, FileCode, MapPin } from "lucide-react";
import { useState, useEffect } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/tooltip";

import { cn } from "@/shared/utilities";

import { read } from "@/api/storage/crud/read";
import { getStorageKeys } from "../api/queries/get-storage-keys";
import { getStorageKeyMetadata } from "../api/storage-metadata";
import { update } from "@/api/storage/crud/update";
import { destroy } from "@/api/storage/crud/destroy";
import { create } from "@/api/storage/crud/create";

import type { BaseEntity } from "@/api/storage/generic-types";

interface StorageStatusPanelProps {
	isOpen: boolean
	onClose: () => void
}

interface StorageKeyData {
	key: string
	items: BaseEntity[]
	isExpanded: boolean
}

interface CategorizedStorage {
	category: string
	keys: StorageKeyData[]
	isExpanded: boolean
}

// Categorize storage keys based on patterns
function categorizeStorageKeys(data: StorageKeyData[]): CategorizedStorage[] {
	const categories: Record<string, StorageKeyData[]> = {
		'Notes & Content': [],
		'Settings': [],
		'Shortcuts': [],
		'Other': [],
	};

	data.forEach(item => {
		if (item.key.toLowerCase().includes('note') || item.key.toLowerCase().includes('skriuw')) {
			categories['Notes & Content'].push(item);
		} else if (item.key.toLowerCase().includes('setting') || item.key.toLowerCase().includes('config')) {
			categories['Settings'].push(item);
		} else if (item.key.toLowerCase().includes('shortcut') || item.key.toLowerCase().includes('command')) {
			categories['Shortcuts'].push(item);
		} else {
			categories['Other'].push(item);
		}
	});

	const result: CategorizedStorage[] = [];

	Object.entries(categories).forEach(([category, keys]) => {
		if (keys.length > 0) {
			result.push({
				category,
				keys,
				isExpanded: true,
			});
		}
	});

	return result;
}

// Get a preview of the item's actual data (not just metadata)
function getDataPreview(item: BaseEntity): string {
	const data = { ...item };
	// Remove metadata fields
	delete (data as any).id;
	delete (data as any).createdAt;
	delete (data as any).updatedAt;
	
	// Get the most interesting fields
	const preview = Object.entries(data)
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

export function StorageStatusPanel({ isOpen, onClose }: StorageStatusPanelProps) {
	const [storageData, setStorageData] = useState<StorageKeyData[]>([]);
	const [categorizedData, setCategorizedData] = useState<CategorizedStorage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [editingItem, setEditingItem] = useState<{ key: string; item: BaseEntity } | null>(null);
	const [editedValue, setEditedValue] = useState("");
	const [viewingItem, setViewingItem] = useState<{ key: string; item: BaseEntity } | null>(null);
	const [addingToKey, setAddingToKey] = useState<string | null>(null);
	const [newItemValue, setNewItemValue] = useState("");

	const loadStorageData = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const keys = await getStorageKeys();
			const dataPromises = keys.map(async (key) => {
				try {
					const items = await read<BaseEntity>(key);
					return {
						key,
						items: Array.isArray(items) ? items : items ? [items] : [],
						isExpanded: false,
					};
				} catch {
					return { key, items: [], isExpanded: false };
				}
			});
			
			const data = await Promise.all(dataPromises);
			setStorageData(data);
			setCategorizedData(categorizeStorageKeys(data));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load storage data');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadStorageData();
		}
	}, [isOpen]);

	const toggleCategory = (categoryIndex: number) => {
		setCategorizedData(prev => 
			prev.map((cat, idx) => 
				idx === categoryIndex ? { ...cat, isExpanded: !cat.isExpanded } : cat
			)
		);
	};

	const toggleExpand = (categoryIndex: number, keyIndex: number) => {
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
		if (!confirm('Are you sure you want to delete this item?')) return;
		
		try {
			await destroy(storageKey, itemId);
			await loadStorageData();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete item');
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
			await loadStorageData();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save changes');
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
			await loadStorageData();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create item');
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

	if (!isOpen) return null;

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
								onClick={loadStorageData}
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
					<CardDescription>View and manage all your stored data</CardDescription>
					
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

				<CardContent className="flex-1 overflow-hidden p-0">
					{error && (
						<div className="mx-4 mb-3 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

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
								{filteredData.map((category, categoryIndex) => (
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
											<span className="font-semibold text-sm">{category.category}</span>
											<Badge variant="outline" className="ml-auto">
												{category.keys.reduce((sum, k) => sum + k.items.length, 0)} items
											</Badge>
										</button>

										{/* Storage Keys in Category */}
										{category.isExpanded && (
											<div className="space-y-2 ml-2">
												{category.keys.map((data, keyIndex) => (
													<div key={data.key} className="border rounded-lg overflow-hidden">
														{/* Key Header */}
														<button
															onClick={() => toggleExpand(categoryIndex, keyIndex)}
															className="w-full flex items-center justify-between p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors"
														>
															<div className="flex items-center gap-2 flex-1 min-w-0">
																{data.isExpanded ? (
																	<ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
																) : (
																	<ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
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
																</div>
																<Badge variant="secondary" className="ml-auto flex-shrink-0">
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
																				<div className="flex gap-1 flex-shrink-0">
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
												))}
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}

