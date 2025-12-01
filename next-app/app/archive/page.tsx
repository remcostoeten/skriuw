'use client'

import { Download, Archive, Upload } from 'lucide-react'
import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

import { AppLayoutContainer } from '@/components/layout/app-layout-container'

export default function ArchivePage() {
	const [activeTab, setActiveTab] = useState('archived')

	return (
		<AppLayoutContainer showSidebar={false}>
			<div className="flex flex-col h-full">
				<div className="border-b border-border/70 bg-muted/40 backdrop-blur-sm px-6 py-4">
					<h1 className="text-2xl font-semibold flex items-center gap-2">
						<Archive className="h-6 w-6" />
						Archive & Collections
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Import collections, manage archived items, and export your notes
					</p>
				</div>

				<div className="flex-1 overflow-hidden">
					<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
						<div className="border-b border-border/70 px-6">
							<TabsList className="bg-transparent">
								<TabsTrigger value="import" className="flex items-center gap-2">
									<Download className="h-4 w-4" />
									Import Collection
								</TabsTrigger>
								<TabsTrigger value="archived" className="flex items-center gap-2">
									<Archive className="h-4 w-4" />
									Archived Items
								</TabsTrigger>
								<TabsTrigger value="export" className="flex items-center gap-2">
									<Upload className="h-4 w-4" />
									Export Collection
								</TabsTrigger>
							</TabsList>
						</div>

						<div className="flex-1 overflow-y-auto">
							<TabsContent value="import" className="m-0 p-6 h-full">
								<div className="max-w-4xl mx-auto">
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Import Collections</h2>
										<p className="text-sm text-muted-foreground">
											Import functionality is coming soon.
										</p>
									</div>
									<div className="text-center py-12 border border-dashed border-border rounded-lg">
										<Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
										<p className="text-muted-foreground mb-4">Seed importing is no longer supported.</p>
										<p className="text-sm text-muted-foreground">
											Check back later for new collection workflows.
										</p>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="archived" className="m-0 p-6 h-full">
								<div className="max-w-4xl mx-auto">
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Archived Items</h2>
										<p className="text-sm text-muted-foreground">
											View and manage your archived notes and folders
										</p>
									</div>
									<div className="text-center py-12 border border-dashed border-border rounded-lg">
										<Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
										<p className="text-muted-foreground">Archive functionality coming soon</p>
										<p className="text-sm text-muted-foreground mt-2">
											You&apos;ll be able to archive notes and folders here
										</p>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="export" className="m-0 p-6 h-full">
								<div className="max-w-4xl mx-auto">
									<div className="mb-6">
										<h2 className="text-xl font-semibold mb-2">Export Collection</h2>
										<p className="text-sm text-muted-foreground">
											Export your notes and folders as a collection seed file
										</p>
									</div>
									<div className="text-center py-12 border border-dashed border-border rounded-lg">
										<Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
										<p className="text-muted-foreground">Export functionality coming soon</p>
										<p className="text-sm text-muted-foreground mt-2">
											You&apos;ll be able to export your notes as collections here
										</p>
									</div>
								</div>
							</TabsContent>
						</div>
					</Tabs>
				</div>
			</div>

		</AppLayoutContainer>
	)
}
