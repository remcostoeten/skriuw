"use client";
/* eslint-disable */

import { useState, useRef, useEffect } from "react";
import {
	ChevronRight,
	MoreHorizontal,
	EyeOff,
	Trash2,
	Pencil,
	ArrowUp,
	ArrowDown,
} from "lucide-react";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";

type Props = {
	id: string;
	title: string;
	isCollapsed: boolean;
	showHeader?: boolean;
	showCollapseToggle?: boolean;
	compactMode?: boolean;
	isCustom?: boolean;
	itemCount?: number;
	isDraggable?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onToggleCollapse: () => void;
	onToggleVisibility?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	onRename?: (name: string) => void;
	onDelete?: () => void;
	onDragStart?: (event: React.DragEvent) => void;
	onDragOver?: (event: React.DragEvent) => void;
	onDrop?: (event: React.DragEvent) => void;
	onDragEnd?: () => void;
	children: React.ReactNode;
	actions?: React.ReactNode;
	// When provided, replaces the plain title text in the header (e.g. inline
	// controls). The section keeps its chevron + menu; the title becomes the slot.
	titleSlot?: React.ReactNode;
	// Rendered between the chevron and the title (e.g. a color dot).
	leading?: React.ReactNode;
	// When set, a swatch picker is shown at the top of the ⋯ menu.
	colorOptions?: ReadonlyArray<{ name: string; value: string }>;
	currentColor?: string;
	onSelectColor?: (value: string) => void;
};

export function SidebarSection({
	id: _id,
	title,
	isCollapsed,
	showHeader = true,
	showCollapseToggle = true,
	compactMode = false,
	isCustom = false,
	itemCount,
	isDraggable = false,
	isDragging = false,
	isDropTarget = false,
	onToggleCollapse,
	onToggleVisibility,
	onMoveUp,
	onMoveDown,
	canMoveUp = false,
	canMoveDown = false,
	onRename,
	onDelete,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	children,
	actions,
	titleSlot,
	leading,
	colorOptions,
	currentColor,
	onSelectColor,
}: Props) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(title);
	const [showMenu, setShowMenu] = useState(false);
	const [isHydrated, setIsHydrated] = useState(false);
	const prefersReducedMotion = useReducedMotion();
	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	const handleRename = () => {
		if (onRename && editValue.trim() && editValue !== title) {
			onRename(editValue.trim());
		}
		setIsEditing(false);
	};

	// Close menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(e.target as Node) &&
				buttonRef.current &&
				!buttonRef.current.contains(e.target as Node)
			) {
				setShowMenu(false);
			}
		};

		if (showMenu) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showMenu]);

	const hasContextActions = Boolean(
		onRename ||
		onToggleVisibility ||
		onMoveUp ||
		onMoveDown ||
		(isCustom && onDelete) ||
		(onSelectColor && colorOptions?.length),
	);

	return (
		<LazyMotion features={domAnimation} strict>
			<section className={cn("mx-2 last:mb-0", compactMode ? "mb-0.25" : "mb-0.5")}>
				{showHeader && (
					<ContextMenu>
						<ContextMenuTrigger asChild disabled={!hasContextActions}>
							<div
								onDragOver={onDragOver}
								onDrop={onDrop}
								onClick={showCollapseToggle ? onToggleCollapse : undefined}
								className={cn(
									"group relative flex items-center gap-1.5 px-2 transition-colors hover:bg-muted",
									showCollapseToggle ? "cursor-pointer" : "cursor-default",
									compactMode ? "min-h-7" : "min-h-8 md:h-7 md:min-h-0",
									"[@media(pointer:coarse)]:min-h-11",
									isDropTarget && "bg-muted/80 ring-1 ring-border",
									isDragging && "opacity-55",
								)}
							>
								{showCollapseToggle && (
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											onToggleCollapse();
										}}
										className={cn(
											"flex items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-foreground",
											compactMode ? "h-3.5 w-3.5" : "h-4 w-4",
										)}
									>
										<ChevronRight
											className={cn(
												"transition-transform",
												compactMode ? "h-2.5 w-2.5" : "h-3 w-3",
												(!isHydrated || !isCollapsed) && "rotate-90",
											)}
											strokeWidth={1.5}
										/>
									</button>
								)}

								{leading && (
									<span className="flex shrink-0 items-center">{leading}</span>
								)}

								{titleSlot ? (
									<div
										onClick={(event) => event.stopPropagation()}
										className="flex min-w-0 flex-1 items-center gap-1 pr-12"
									>
										{titleSlot}
									</div>
								) : isEditing ? (
									<input
										type="text"
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										onBlur={handleRename}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleRename();
											if (e.key === "Escape") {
												setEditValue(title);
												setIsEditing(false);
											}
										}}
										className={cn(
											"flex-1 bg-transparent font-medium uppercase tracking-wide text-muted-foreground outline-none border-b border-foreground/30 text-base md:text-[11px]",
											compactMode && "md:text-[10px]",
										)}
										autoFocus
									/>
								) : (
									<span
										draggable={isDraggable}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										className={cn(
											"flex-1 truncate pr-8 font-medium uppercase tracking-wide text-muted-foreground/60",
											compactMode ? "text-[10px]" : "text-[11px]",
											isDraggable && "cursor-grab active:cursor-grabbing",
										)}
									>
										{title}
									</span>
								)}

								<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center justify-end">
									{itemCount !== undefined && (
										<span className="w-4 shrink-0 text-right text-[10px] text-muted-foreground/40 tabular-nums transition-opacity md:group-hover:opacity-0">
											{itemCount}
										</span>
									)}
								</div>

								<div className="hover-reveal absolute inset-y-0 right-1.5 flex items-center justify-end gap-0.5">
									{actions}

									{(isCustom || onToggleVisibility) && (
										<div className="relative">
											<button
												type="button"
												ref={buttonRef}
												onClick={(event) => {
													event.stopPropagation();
													setShowMenu(!showMenu);
												}}
												className={cn(
													"flex items-center justify-center border border-transparent text-muted-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground",
													compactMode
														? "h-4 w-4"
														: "h-5 w-5 md:h-4 md:w-4",
												)}
											>
												<MoreHorizontal
													className="h-3 w-3"
													strokeWidth={1.5}
												/>
											</button>

											<AnimatePresence>
												{showMenu && (
													<m.div
														ref={menuRef}
														initial={
															prefersReducedMotion
																? { opacity: 0 }
																: { opacity: 0, scale: 0.96, y: -4 }
														}
														animate={
															prefersReducedMotion
																? { opacity: 1 }
																: { opacity: 1, scale: 1, y: 0 }
														}
														exit={
															prefersReducedMotion
																? { opacity: 0 }
																: { opacity: 0, scale: 0.98, y: -2 }
														}
														transition={{
															duration: prefersReducedMotion
																? 0.1
																: 0.15,
															ease: [0.16, 1, 0.3, 1],
														}}
														className="absolute right-0 top-full z-50 mt-1 min-w-[8rem] origin-top-right overflow-hidden border border-border bg-popover p-1 text-popover-foreground shadow-lg will-change-[opacity,transform]"
													>
														{onSelectColor && colorOptions && (
															<div className="flex flex-wrap gap-1 px-2 py-1.5">
																{colorOptions.map((color) => (
																	<button
																		key={color.value}
																		type="button"
																		onClick={() => {
																			onSelectColor(
																				color.value,
																			);
																			setShowMenu(false);
																		}}
																		aria-label={color.name}
																		className={cn(
																			"h-4 w-4 rounded-full transition-transform hover:scale-110",
																			color.value,
																			currentColor ===
																				color.value &&
																				"ring-2 ring-foreground/50 ring-offset-1 ring-offset-popover",
																		)}
																	/>
																))}
															</div>
														)}
														{onRename && (
															<button
																type="button"
																onClick={() => {
																	setIsEditing(true);
																	setShowMenu(false);
																}}
																className="relative flex w-full cursor-default select-none items-center gap-2 px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground"
															>
																<Pencil className="w-3.5 h-3.5" />
																Rename
															</button>
														)}
														{onToggleVisibility && (
															<button
																type="button"
																onClick={() => {
																	onToggleVisibility();
																	setShowMenu(false);
																}}
																className="relative flex w-full cursor-default select-none items-center gap-2 whitespace-nowrap px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground"
															>
																<EyeOff className="w-3.5 h-3.5" />
																Hide
															</button>
														)}
														{onMoveUp && (
															<button
																type="button"
																onClick={() => {
																	onMoveUp();
																	setShowMenu(false);
																}}
																disabled={!canMoveUp}
																className="relative flex w-full cursor-default select-none items-center gap-2 whitespace-nowrap px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
															>
																<ArrowUp className="w-3.5 h-3.5" />
																Move up
															</button>
														)}
														{onMoveDown && (
															<button
																type="button"
																onClick={() => {
																	onMoveDown();
																	setShowMenu(false);
																}}
																disabled={!canMoveDown}
																className="relative flex w-full cursor-default select-none items-center gap-2 whitespace-nowrap px-2 py-1.5 text-left text-sm outline-none hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
															>
																<ArrowDown className="w-3.5 h-3.5" />
																Move down
															</button>
														)}
														{isCustom && onDelete && (
															<button
																type="button"
																onClick={() => {
																	onDelete();
																	setShowMenu(false);
																}}
																className="relative flex w-full cursor-default select-none items-center gap-2 px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-muted"
															>
																<Trash2 className="w-3.5 h-3.5" />
																Delete
															</button>
														)}
													</m.div>
												)}
											</AnimatePresence>
										</div>
									)}
								</div>
							</div>
						</ContextMenuTrigger>
						{hasContextActions && (
							<ContextMenuContent>
								{onSelectColor && colorOptions && (
									<>
										<div className="flex flex-wrap gap-1 px-2 py-1.5">
											{colorOptions.map((color) => (
												<button
													key={color.value}
													type="button"
													onClick={() => onSelectColor(color.value)}
													aria-label={color.name}
													className={cn(
														"h-4 w-4 rounded-full transition-transform hover:scale-110",
														color.value,
														currentColor === color.value &&
															"ring-2 ring-foreground/50 ring-offset-1 ring-offset-popover",
													)}
												/>
											))}
										</div>
										<ContextMenuSeparator />
									</>
								)}
								{onRename && (
									<ContextMenuItem
										className="gap-2"
										onSelect={() => setIsEditing(true)}
									>
										<Pencil className="h-3.5 w-3.5" />
										Rename
									</ContextMenuItem>
								)}
								{onToggleVisibility && (
									<ContextMenuItem
										className="gap-2"
										onSelect={onToggleVisibility}
									>
										<EyeOff className="h-3.5 w-3.5" />
										Hide
									</ContextMenuItem>
								)}
								{onMoveUp && (
									<ContextMenuItem
										className="gap-2"
										disabled={!canMoveUp}
										onSelect={onMoveUp}
									>
										<ArrowUp className="h-3.5 w-3.5" />
										Move up
									</ContextMenuItem>
								)}
								{onMoveDown && (
									<ContextMenuItem
										className="gap-2"
										disabled={!canMoveDown}
										onSelect={onMoveDown}
									>
										<ArrowDown className="h-3.5 w-3.5" />
										Move down
									</ContextMenuItem>
								)}
								{isCustom && onDelete && (
									<>
										<ContextMenuSeparator />
										<ContextMenuItem
											className="gap-2 text-destructive focus:text-destructive"
											onSelect={onDelete}
										>
											<Trash2 className="h-3.5 w-3.5" />
											Delete
										</ContextMenuItem>
									</>
								)}
							</ContextMenuContent>
						)}
					</ContextMenu>
				)}

				{(!isHydrated || !isCollapsed) && (
					<div className={cn(showHeader ? "pb-2 pt-0.5" : "pb-1 pt-0")}>{children}</div>
				)}
			</section>
		</LazyMotion>
	);
}
