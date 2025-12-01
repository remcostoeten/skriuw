import { Skeleton } from '@/shared/ui/skeleton'

import { SidebarSkeleton } from '@/components/sidebar/sidebar-skeleton'

import { AppLayoutShell } from './app-layout-shell'

function LeftToolbarSkeleton() {
	return (
		<div className="w-12 h-full bg-sidebar-background border-r border-sidebar-border flex flex-col justify-between items-center px-1.5 py-2">
			<div className="flex flex-col items-center gap-2">
				<Skeleton className="h-7 w-7 rounded-md" />
				{Array.from({ length: 4 }).map((_, index) => (
					<Skeleton key={index} className="h-8 w-8 rounded-md" />
				))}
			</div>
			<div className="flex flex-col items-center gap-2 pb-10">
				<Skeleton className="h-8 w-8 rounded-md" />
			</div>
		</div>
	)
}

function TopToolbarSkeleton() {
	return (
		<div className="h-10 bg-background border-b border-border flex items-center justify-between px-2">
			<div className="flex items-center gap-1.5">
				{Array.from({ length: 3 }).map((_, index) => (
					<Skeleton key={index} className="h-7 w-7 rounded-md" />
				))}
			</div>

			<div className="flex-1 flex justify-center">
				<Skeleton className="h-5 w-48 rounded-sm" />
			</div>

			<div className="flex items-center gap-1.5">
				{Array.from({ length: 2 }).map((_, index) => (
					<Skeleton key={index} className="h-7 w-7 rounded-md" />
				))}
			</div>
		</div>
	)
}

function EditorPaneSkeleton() {
	return (
		<div className="flex-1 overflow-hidden bg-background">
			<div className="h-full w-full overflow-y-auto p-6 sm:p-10 space-y-6">
				<div className="space-y-2">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-8 w-3/5" />
					<Skeleton className="h-6 w-2/5" />
				</div>

				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, index) => (
						<Skeleton
							key={index}
							className={`h-4 ${index % 2 === 0 ? 'w-full' : 'w-3/4'}`}
						/>
					))}
				</div>

				<div className="grid grid-cols-3 gap-4 pt-2">
					{Array.from({ length: 3 }).map((_, index) => (
						<div
							key={index}
							className="border border-border rounded-lg p-4 space-y-3"
						>
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-6 w-1/2" />
							<Skeleton className="h-4 w-full" />
						</div>
					))}
				</div>

				<div className="space-y-2 pt-4">
					<Skeleton className="h-4 w-1/3" />
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-4 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}

function FooterSkeleton() {
	return (
		<div className="h-9 bg-sidebar-background border-t border-border flex items-center justify-between px-2">
			<div className="flex items-center gap-2">
				<Skeleton className="h-6 w-6 rounded-full" />
				<Skeleton className="h-6 w-6 rounded-md" />
			</div>
			<div className="flex items-center gap-2">
				{Array.from({ length: 3 }).map((_, index) => (
					<Skeleton key={index} className="h-6 w-6 rounded-md" />
				))}
			</div>
		</div>
	)
}

export function AppLayoutLoadingSkeleton() {
	return (
		<AppLayoutShell
			leftToolbar={<LeftToolbarSkeleton />}
			sidebar={<SidebarSkeleton />}
			topToolbar={<TopToolbarSkeleton />}
			mainContent={<EditorPaneSkeleton />}
			footer={<FooterSkeleton />}
			rightPanel={null}
			floatingWidgets={null}
			isSidebarOpen
			isDesktopSidebarOpen
			isRightPanelOpen={false}
		/>
	)
}
